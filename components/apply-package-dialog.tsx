"use client"

import { useEffect, useMemo, useState } from "react"
import { Boxes, Search, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useActivePackages, useRateTypes } from "@/lib/use-data"
import type { BookingTransportRequest, Package, PackageDetail, QuoteLineItem } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"
import { PresenceAvatars } from "@/components/presence-avatars"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { CommissionControl, type CommissionControlValue } from "@/components/supplier/commission-control"
import { CommissionBadge } from "@/components/quotes/commission-badge"
import { QuoteLineSupplierPicker, type QuoteExtraSelection } from "@/components/quote-line-supplier-picker"
import { getDestinationLocationIds } from "@/lib/packages/location-filter"
import { RateTypeSelect } from "@/components/rate-type-select"
import { SuiteLegEditor } from "@/components/packages/suite-leg-editor"
import { TransportLegEditor } from "@/components/packages/transport-leg-editor"
import { TripDateSummary } from "@/components/packages/trip-date-summary"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import { deriveTripDateRangeFromStates } from "@/lib/packages/trip-date-range"
import {
  applyAnchoredHotelDates,
  buildDefaultLegStates,
  hydrateFromSaved,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  toApplySelections,
  toHotelAnchorContext,
  toPackageSelectionsPatch,
  toTransportRequestsPut,
  validateConfigureState,
  type ApplyCommissionOverride,
  type ApplyLegState,
  type HotelAnchorContext,
  type SavedPackageState,
} from "@/lib/packages/apply-dialog-state"

interface ApplyPackageDialogProps {
  jobId: string
  quoteId: string
  travelDate: string | null
  existingLineItemCount: number
  /** Existing quote lines — manual/extra lines (snapshot.isExtra) are preserved across re-apply. */
  existingLineItems?: QuoteLineItem[]
  expectedUpdatedAt?: string
  /** Customer's default rate type — pre-selects the rate version when applying a package. */
  customerDefaultRateTypeId?: string | null
  onApplied: () => void
}

interface QuotePatchPayload {
  lineItems: QuoteLineItem[]
}

interface QuotePatchResponse {
  id: string
  subtotal: number
  vat: number
  total: number
  lineItems: QuoteLineItem[]
  updatedAt: string
}

function formatPrice(amount: number | null, currency: string) {
  if (amount === null) return null
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

type Step = "pick" | "configure" | "confirm"

/** Extras carry their own rate type, like legs do. */
type ExtraWithRateType = QuoteExtraSelection & { rateTypeId: string | null }

interface LegCommissionState {
  value: CommissionControlValue
  show: boolean
}

export function ApplyPackageDialog({
  jobId,
  quoteId,
  travelDate,
  existingLineItemCount,
  existingLineItems = [],
  expectedUpdatedAt,
  customerDefaultRateTypeId,
  onApplied,
}: ApplyPackageDialogProps) {
  const { data: packages = [] } = useActivePackages()
  const { data: rateTypesData } = useRateTypes()
  const rateTypes = useMemo(
    () => (rateTypesData?.rateTypes ?? []).filter((rt) => !rt.archivedAt),
    [rateTypesData],
  )
  const systemDefaultRateTypeId = rateTypes.find((rt) => rt.isDefault)?.id ?? ""
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("pick")
  const [search, setSearch] = useState("")
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savedState, setSavedState] = useState<SavedPackageState | null>(null)
  const [existingTransportRequests, setExistingTransportRequests] = useState<BookingTransportRequest[]>([])
  const [legStates, setLegStates] = useState<ApplyLegState[]>([])
  const [totalsBySupplierId, setTotalsBySupplierId] = useState<Record<string, PassengerTotals>>({})
  const [commissionByLegId, setCommissionByLegId] = useState<Record<string, LegCommissionState>>({})
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [extras, setExtras] = useState<ExtraWithRateType[]>([])
  const [validating, setValidating] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const { others, setEditing } = useRecordPresence("quote", open ? quoteId : undefined)
  const {
    save: saveQuote,
    isSaving: applying,
    conflict: quoteConflict,
    clearConflict: clearQuoteConflict,
  } = useVersionedSave<QuotePatchPayload, QuotePatchResponse>({
    url: `/api/quotes/${quoteId}`,
    method: "PATCH",
    entity: "quote",
    recordId: quoteId,
    expectedUpdatedAt,
  })

  const activePackages = packages.filter((pkg) => pkg.active)
  const filteredPackages = activePackages.filter((pkg) =>
    pkg.name.toLowerCase().includes(search.toLowerCase()) ||
    (pkg.trainRouteName ?? "").toLowerCase().includes(search.toLowerCase()),
  )

  const defaultRateTypeId = customerDefaultRateTypeId || systemDefaultRateTypeId || null

  useEffect(() => {
    setEditing(open && step !== "pick")
  }, [open, setEditing, step])

  // Reconcile per-leg/per-extra rate types once the rate-type list resolves (it may load after
  // the configure step opens): fill empty ones and replace archived ones with the default.
  useEffect(() => {
    if (step !== "configure" || !defaultRateTypeId) return
    const activeIds = new Set(rateTypes.map((rt) => rt.id))
    setLegStates((prev) =>
      prev.some((state) => !state.rateTypeId || !activeIds.has(state.rateTypeId))
        ? prev.map((state) =>
            state.rateTypeId && activeIds.has(state.rateTypeId)
              ? state
              : { ...state, rateTypeId: defaultRateTypeId },
          )
        : prev,
    )
    setExtras((prev) =>
      prev.some((extra) => !extra.rateTypeId || !activeIds.has(extra.rateTypeId))
        ? prev.map((extra) =>
            extra.rateTypeId && activeIds.has(extra.rateTypeId)
              ? extra
              : { ...extra, rateTypeId: defaultRateTypeId },
          )
        : prev,
    )
  }, [step, defaultRateTypeId, rateTypes])

  // Load the booking's saved package configuration when the dialog opens, so re-opening
  // pre-fills everything the last apply (or the Gravity Forms intake) persisted.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [packageRes, transportRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}/package`),
          fetch(`/api/jobs/${jobId}/transport-requests`),
        ])
        if (cancelled) return
        setSavedState(packageRes.ok ? ((await packageRes.json()) as SavedPackageState) : null)
        setExistingTransportRequests(
          transportRes.ok ? ((await transportRes.json()) as BookingTransportRequest[]) : [],
        )
      } catch {
        if (!cancelled) {
          setSavedState(null)
          setExistingTransportRequests([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, jobId])

  const sortedLegs = useMemo(
    () => (packageDetail?.legs ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [packageDetail],
  )

  function reset() {
    setStep("pick")
    setSearch("")
    setSelectedPackage(null)
    setPackageDetail(null)
    setLegStates([])
    setTotalsBySupplierId({})
    setCommissionByLegId({})
    setPreviewLineItems([])
    setExtras([])
    setApplyError(null)
    setValidationErrors([])
    clearQuoteConflict()
  }

  const destinationLocationIds = packageDetail ? getDestinationLocationIds(packageDetail.legs) : []
  // Manual/extra lines added previously survive a package re-apply; new extras come back in the preview.
  const preservedExtras = existingLineItems.filter((li) => li.pricingSnapshot?.isExtra === true)
  const lineItemsToSave = [...previewLineItems, ...preservedExtras]

  async function selectPackage(pkg: Package) {
    setSelectedPackage(pkg)
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/packages/${pkg.slug}`)
      if (!res.ok) throw new Error("Failed to load package details")
      const detail: PackageDetail = await res.json()
      setPackageDetail(detail)

      const splitSupplierIds = Array.from(
        new Set(
          detail.legs
            .filter((leg) => PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind))
            .map((leg) => leg.supplierId),
        ),
      )
      let totals: Record<string, PassengerTotals> = {}
      if (splitSupplierIds.length > 0) {
        const totalsRes = await fetch(
          `/api/jobs/${jobId}/passenger-totals?supplierIds=${splitSupplierIds.join(",")}`,
        )
        if (totalsRes.ok) {
          totals = ((await totalsRes.json()) as { totalsBySupplierId: Record<string, PassengerTotals> })
            .totalsBySupplierId
        }
      }
      setTotalsBySupplierId(totals)

      const isSavedPackage = savedState?.packageId === pkg.id
      // The job's enquiry travel date seeds default service dates; everything stays editable.
      const startDate = (isSavedPackage ? savedState?.tripStartDate : null) ?? travelDate ?? ""

      const stateOptions = { tripStartDate: startDate || null, totalsBySupplierId: totals, defaultRateTypeId }
      setLegStates(
        isSavedPackage && savedState
          ? hydrateFromSaved(detail, savedState, existingTransportRequests, stateOptions)
          : buildDefaultLegStates(detail, stateOptions),
      )
      setCommissionByLegId({})
      setStep("configure")
    } catch {
      toast.error("Could not load package details")
    } finally {
      setLoadingDetail(false)
    }
  }

  // Anchored hotel dates are derived, so every edit re-runs them: changing the train's departure
  // date or a hotel's night count immediately re-dates the stays that hang off it.
  function updateLegState(next: ApplyLegState) {
    setLegStates((prev) => {
      const merged = prev.map((state) => (state.legId === next.legId ? next : state))
      return packageDetail ? applyAnchoredHotelDates(packageDetail, merged) : merged
    })
  }

  function hotelAnchorContext(legId: string): HotelAnchorContext | null {
    if (!packageDetail) return null
    return toHotelAnchorContext(packageDetail, legStates, legId)
  }

  async function validateAndPreview() {
    if (!selectedPackage || !packageDetail) return

    const problems = validateConfigureState(packageDetail, legStates, { totalsBySupplierId })
    // Pricing needs at least one dated service (rate cards match on the derived trip start).
    const derivedRange = deriveTripDateRangeFromStates(packageDetail, legStates)
    if (problems.length === 0 && !derivedRange.start) {
      problems.push("Add a date to at least one service — trip dates are worked out from them")
    }
    setValidationErrors(problems)
    if (problems.length > 0) return

    setValidating(true)
    setApplyError(null)

    try {
      // 1. Assign the package to the booking (reseeds selections on package change). Trip dates
      // are derived server-side from the per-service dates saved in the next step.
      const assignRes = await fetch(`/api/jobs/${jobId}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selectedPackage.id }),
      })
      if (!assignRes.ok) {
        const body = await assignRes.json().catch(() => ({}))
        setApplyError(`Could not assign package to booking: ${body.error ?? assignRes.statusText}`)
        return
      }

      // 2. Persist per-leg selections and suite units (voucher generation reads these).
      const patchRes = await fetch(`/api/jobs/${jobId}/package-selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPackageSelectionsPatch(legStates)),
      })
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => ({}))
        setApplyError(`Could not save package selections: ${body.error ?? patchRes.statusText}`)
        return
      }

      // 3. Persist transport requests — pricing reads them from the DB in the next step.
      const transportPut = toTransportRequestsPut(legStates, existingTransportRequests)
      const transportRes = await fetch(`/api/jobs/${jobId}/transport-requests`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transportPut),
      })
      if (!transportRes.ok) {
        const body = await transportRes.json().catch(() => ({}))
        setApplyError(`Could not save transport details: ${body.error ?? transportRes.statusText}`)
        return
      }
      const savedTransportRows = (await transportRes.json().catch(() => null)) as
        | BookingTransportRequest[]
        | null
      if (savedTransportRows) setExistingTransportRequests(savedTransportRows)

      // 4. Price the quote from the persisted configuration.
      const commissionOverrides: Record<string, ApplyCommissionOverride | null> = {}
      for (const [legId, state] of Object.entries(commissionByLegId)) {
        const override = state.value
        commissionOverrides[legId] =
          override.type !== null && override.value !== null && Number.isFinite(override.value)
            ? { type: override.type, value: override.value }
            : null
      }

      const res = await fetch(`/api/packages/${selectedPackage.slug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          quoteId,
          travelDate: derivedRange.start,
          selections: toApplySelections(legStates, commissionOverrides),
          extras: extras.map((extra) => ({
            supplierId: extra.supplierId,
            routeId: extra.routeId,
            suiteTypeId: extra.suiteTypeId,
            quantity: extra.quantity,
            rateTypeId: extra.rateTypeId ?? undefined,
          })),
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setApplyError(typeof payload?.error === "string" ? payload.error : "Validation failed")
        return
      }
      setPreviewLineItems(payload.lineItems as QuoteLineItem[])
      setStep("confirm")
    } catch {
      setApplyError("Failed to validate pricing. Please try again.")
    } finally {
      setValidating(false)
    }
  }

  async function applyToQuote(options?: { ignoreExpectedUpdatedAt: boolean }) {
    if (previewLineItems.length === 0) return
    try {
      await saveQuote({ lineItems: lineItemsToSave }, options)
      toast.success(`Package "${selectedPackage?.name}" applied to quote`)
      setOpen(false)
      reset()
      onApplied()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply package"
      setApplyError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Boxes className="mr-2 h-4 w-4" />
          Apply Package
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        {step === "pick" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Apply a package
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                Select a package to configure suites, passengers, and transport, then price this quote.
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search packages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredPackages.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No active packages found</p>
              ) : (
                filteredPackages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/20 disabled:opacity-50"
                    disabled={loadingDetail}
                    onClick={() => selectPackage(pkg)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium">
                          {pkg.name}
                          {savedState?.packageId === pkg.id ? (
                            <Badge variant="outline" className="text-[10px]">On booking</Badge>
                          ) : null}
                        </p>
                        {pkg.trainRouteName ? (
                          <p className="text-xs text-muted-foreground">{pkg.trainRouteName}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        {pkg.fixedPricePerPerson !== null ? (
                          <p className="text-xs font-medium">{formatPrice(pkg.fixedPricePerPerson, pkg.currency)} pp</p>
                        ) : pkg.priceTo !== null ? (
                          <p className="text-xs font-medium">
                            {pkg.priceFrom !== null
                              ? `${formatPrice(pkg.priceFrom, pkg.currency)} – ${formatPrice(pkg.priceTo, pkg.currency)} pp`
                              : `${formatPrice(pkg.priceTo, pkg.currency)} pp`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pkg.supplierKinds.map((kind) => (
                        <Badge key={kind} variant="secondary" className="text-[10px]">
                          {SUPPLIER_KIND_LABELS[kind]}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {step === "configure" && packageDetail && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {packageDetail.name}
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                Configure the trip, suites, and transport. Saving here updates the booking and prices the quote.
              </DialogDescription>
            </DialogHeader>

            <TripDateSummary detail={packageDetail} states={legStates} />

            <div className="space-y-4">
              {sortedLegs.map((leg) => {
                const state = legStates.find((candidate) => candidate.legId === leg.id)
                if (!state) return null
                const commission = commissionByLegId[leg.id]
                return (
                  <div key={leg.id} className="space-y-2">
                    {state.kind === "transport" ? (
                      <TransportLegEditor leg={leg} value={state} onChange={updateLegState} rateTypes={rateTypes} />
                    ) : (
                      <SuiteLegEditor
                        leg={leg}
                        value={state}
                        onChange={updateLegState}
                        expectedTotals={totalsBySupplierId[leg.supplierId] ?? null}
                        anchorContext={hotelAnchorContext(leg.id)}
                        rateTypes={rateTypes}
                      />
                    )}
                    {state.selected ? (
                      <div className="pl-3">
                        {commission?.show ? (
                          <CommissionControl
                            value={commission.value}
                            onChange={(next) =>
                              setCommissionByLegId((prev) => ({
                                ...prev,
                                [leg.id]: { value: next, show: true },
                              }))
                            }
                            isEditing
                            label="Commission Override"
                            onClear={() =>
                              setCommissionByLegId((prev) => ({
                                ...prev,
                                [leg.id]: { value: { type: null, value: null }, show: false },
                              }))
                            }
                            clearLabel="Remove"
                          />
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            onClick={() =>
                              setCommissionByLegId((prev) => ({
                                ...prev,
                                [leg.id]: { value: prev[leg.id]?.value ?? { type: null, value: null }, show: true },
                              }))
                            }
                          >
                            + Override commission
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>

            <div className="space-y-3 border-t pt-4">
              <div>
                <Label>Extras (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Add items this package doesn&apos;t include — e.g. an extra hotel, transfer, or rental the client requested.
                </p>
              </div>
              {extras.length > 0 ? (
                <div className="space-y-1.5">
                  {extras.map((extra, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{extra.supplierName}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {extra.routeName} · {extra.suiteTypeName}
                          {extra.quantity ? ` ×${extra.quantity}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <RateTypeSelect
                          rateTypes={rateTypes}
                          value={extra.rateTypeId}
                          onChange={(rateTypeId) =>
                            setExtras((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, rateTypeId } : item)),
                            )
                          }
                          label={null}
                          triggerClassName="h-7 w-36 text-xs"
                        />
                        <button
                          type="button"
                          aria-label="Remove extra"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setExtras((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <QuoteLineSupplierPicker
                destinationLocationIds={destinationLocationIds}
                onAdd={(selection) => setExtras((prev) => [...prev, { ...selection, rateTypeId: defaultRateTypeId }])}
                addLabel="Add extra"
              />
            </div>

            {validationErrors.length > 0 && (
              <ul className="space-y-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}

            {applyError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {applyError}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep("pick"); setApplyError(null); setValidationErrors([]) }}>
                Back
              </Button>
              <Button onClick={validateAndPreview} disabled={validating}>
                {validating ? "Saving & pricing…" : "Next"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Confirm replacement
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                {existingLineItemCount > 0
                  ? `This replaces the package lines${
                      preservedExtras.length > 0
                        ? ` and keeps ${preservedExtras.length} existing extra line${preservedExtras.length === 1 ? "" : "s"}`
                        : ""
                    }. The quote will be:`
                  : "The following line items will be added to the quote:"}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[100px]">Unit price</th>
                    <th className="px-3 py-2 text-right whitespace-nowrap min-w-[100px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItemsToSave.map((li, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2 text-xs">
                        <div>
                          {li.description}
                          {li.pricingSnapshot?.isExtra ? (
                            <Badge variant="outline" className="ml-1.5 align-middle text-[9px]">Extra</Badge>
                          ) : null}
                        </div>
                        {li.pricingSnapshot?.rateTypeName && (
                          <span className="text-[11px] text-muted-foreground">
                            {li.pricingSnapshot.rateTypeName}
                            {(() => {
                              const chosen = legStates.find(
                                (state) => state.legId === li.pricingSnapshot?.legId,
                              )?.rateTypeId
                              return chosen &&
                                li.pricingSnapshot.rateTypeId &&
                                li.pricingSnapshot.rateTypeId !== chosen
                                ? " (fallback)"
                                : ""
                            })()}
                          </span>
                        )}
                        <CommissionBadge
                          commission={li.pricingSnapshot?.commission ?? null}
                          currency={packageDetail?.currency ?? "ZAR"}
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        <div>{li.qty}</div>
                        {li.pricingSnapshot?.unit ? (
                          <div className="text-[11px] text-muted-foreground">{li.pricingSnapshot.unit}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">R {li.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">R {li.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {quoteConflict && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {quoteConflict.error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("configure")}>
                Back
              </Button>
              {quoteConflict && (
                <Button variant="outline" onClick={() => applyToQuote({ ignoreExpectedUpdatedAt: true })} disabled={applying}>
                  Save anyway
                </Button>
              )}
              <Button onClick={() => applyToQuote()} disabled={applying}>
                {applying ? "Applying…" : existingLineItemCount > 0 ? "Replace & apply" : "Apply to quote"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
