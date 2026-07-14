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
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { SuiteLegEditor, type HotelAnchorContext } from "@/components/packages/suite-leg-editor"
import { TransportLegEditor } from "@/components/packages/transport-leg-editor"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import {
  applyAnchoredHotelDates,
  buildDefaultLegStates,
  getHotelAnchorContext,
  hydrateFromSaved,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  toApplySelections,
  toPackageSelectionsPatch,
  toTransportRequestsPut,
  validateConfigureState,
  type ApplyCommissionOverride,
  type ApplyLegState,
  type SavedPackageState,
} from "@/lib/packages/apply-dialog-state"

interface ApplyPackageDialogProps {
  jobId: string
  quoteId: string
  travelDate: string | null
  existingLineItemCount: number
  /** Existing quote lines â€” manual/extra lines (snapshot.isExtra) are preserved across re-apply. */
  existingLineItems?: QuoteLineItem[]
  expectedUpdatedAt?: string
  /** Customer's default rate type â€” pre-selects the rate version when applying a package. */
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

function addNights(date: string, nights: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  parsed.setUTCDate(parsed.getUTCDate() + nights)
  return parsed.toISOString().slice(0, 10)
}

type Step = "pick" | "configure" | "confirm"

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
  const rateTypes = (rateTypesData?.rateTypes ?? []).filter((rt) => !rt.archivedAt)
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
  const [tripStartDate, setTripStartDate] = useState("")
  const [tripEndDate, setTripEndDate] = useState("")
  const [commissionByLegId, setCommissionByLegId] = useState<Record<string, LegCommissionState>>({})
  const [rateTypeId, setRateTypeId] = useState("")
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [extras, setExtras] = useState<QuoteExtraSelection[]>([])
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

  useEffect(() => {
    setEditing(open && step !== "pick")
  }, [open, setEditing, step])

  // Backfill the rate type once it resolves, if the picker is still empty
  // (rate types may load after the configure step opens).
  useEffect(() => {
    if (step === "configure" && !rateTypeId) {
      const fallback = customerDefaultRateTypeId || systemDefaultRateTypeId
      if (fallback) setRateTypeId(fallback)
    }
  }, [step, rateTypeId, customerDefaultRateTypeId, systemDefaultRateTypeId])

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
    setTripStartDate("")
    setTripEndDate("")
    setCommissionByLegId({})
    setRateTypeId("")
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
      const startDate = (isSavedPackage ? savedState?.tripStartDate : null) ?? travelDate ?? ""
      const endDate =
        (isSavedPackage ? savedState?.tripEndDate : null) ??
        (startDate && detail.durationNights ? addNights(startDate, detail.durationNights) : "")
      setTripStartDate(startDate)
      setTripEndDate(endDate)

      const stateOptions = { tripStartDate: startDate || null, totalsBySupplierId: totals }
      setLegStates(
        isSavedPackage && savedState
          ? hydrateFromSaved(detail, savedState, existingTransportRequests, stateOptions)
          : buildDefaultLegStates(detail, stateOptions),
      )
      setCommissionByLegId({})
      setRateTypeId(customerDefaultRateTypeId || systemDefaultRateTypeId || "")
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
    const context = getHotelAnchorContext(packageDetail, legStates, legId)
    if (!context) return null
    return {
      trainLabel: context.trainLeg.label ?? context.trainLeg.supplierName,
      departureDate: context.departureDate,
      durationDays: context.durationDays,
    }
  }

  const tripDatesValid = Boolean(tripStartDate) && Boolean(tripEndDate) && tripEndDate >= tripStartDate

  async function validateAndPreview() {
    if (!selectedPackage || !packageDetail) return

    const problems = validateConfigureState(packageDetail, legStates, { totalsBySupplierId })
    if (!tripDatesValid) {
      problems.unshift("Trip start and end dates are required (end on or after start)")
    }
    setValidationErrors(problems)
    if (problems.length > 0) return

    setValidating(true)
    setApplyError(null)

    try {
      // 1. Assign the package + trip dates to the booking (reseeds selections on package change).
      const assignRes = await fetch(`/api/jobs/${jobId}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selectedPackage.id, tripStartDate, tripEndDate }),
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

      // 3. Persist transport requests â€” pricing reads them from the DB in the next step.
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
          travelDate: tripStartDate,
          rateTypeId: rateTypeId || undefined,
          selections: toApplySelections(legStates, commissionOverrides),
          extras: extras.map((extra) => ({
            supplierId: extra.supplierId,
            routeId: extra.routeId,
            suiteTypeId: extra.suiteTypeId,
            quantity: extra.quantity,
            rateTypeId: rateTypeId || undefined,
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
                              ? `${formatPrice(pkg.priceFrom, pkg.currency)} â€“ ${formatPrice(pkg.priceTo, pkg.currency)} pp`
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

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="apply-trip-start">Trip start date</Label>
                <DatePicker
                  id="apply-trip-start"
                  value={tripStartDate}
                  onChange={(value) => setTripStartDate(value ?? "")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="apply-trip-end">Trip end date</Label>
                <DatePicker
                  id="apply-trip-end"
                  value={tripEndDate}
                  onChange={(value) => setTripEndDate(value ?? "")}
                />
              </div>
              {rateTypes.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="apply-rate-type">Rate type</Label>
                  <Select value={rateTypeId} onValueChange={setRateTypeId}>
                    <SelectTrigger id="apply-rate-type" className="h-9">
                      <SelectValue placeholder="System default" />
                    </SelectTrigger>
                    <SelectContent>
                      {rateTypes.map((rt) => (
                        <SelectItem key={rt.id} value={rt.id}>
                          {rt.name}
                          {rt.isDefault ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Applies to every leg; a leg without this rate falls back to the default.
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Covers the full trip, start to finish â€” not just this package&apos;s legs â€” so we track how long the
              customer was with us across everything booked.
            </p>

            <div className="space-y-4">
              {sortedLegs.map((leg) => {
                const state = legStates.find((candidate) => candidate.legId === leg.id)
                if (!state) return null
                const commission = commissionByLegId[leg.id]
                return (
                  <div key={leg.id} className="space-y-2">
                    {state.kind === "transport" ? (
                      <TransportLegEditor leg={leg} value={state} onChange={updateLegState} />
                    ) : (
                      <SuiteLegEditor
                        leg={leg}
                        value={state}
                        onChange={updateLegState}
                        expectedTotals={totalsBySupplierId[leg.supplierId] ?? null}
                        anchorContext={hotelAnchorContext(leg.id)}
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
                  Add items this package doesn&apos;t include â€” e.g. an extra hotel, transfer, or rental the client requested.
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
                          {" Â· "}
                          {extra.routeName} Â· {extra.suiteTypeName}
                          {extra.quantity ? ` Ã—${extra.quantity}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove extra"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setExtras((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <QuoteLineSupplierPicker
                destinationLocationIds={destinationLocationIds}
                onAdd={(selection) => setExtras((prev) => [...prev, selection])}
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
                {validating ? "Saving & pricingâ€¦" : "Next"}
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
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Total</th>
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
                            {rateTypeId &&
                            li.pricingSnapshot.rateTypeId &&
                            li.pricingSnapshot.rateTypeId !== rateTypeId
                              ? " (fallback)"
                              : ""}
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
                      <td className="px-3 py-2 text-right text-xs">R {li.unitPrice.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium">R {li.total.toLocaleString()}</td>
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
                {applying ? "Applyingâ€¦" : existingLineItemCount > 0 ? "Replace & apply" : "Apply to quote"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
