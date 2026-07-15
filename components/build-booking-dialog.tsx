"use client"

import { useEffect, useMemo, useState } from "react"
import { Boxes, ChevronDown, ChevronUp, X } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useActiveSuppliers, useRateTypes } from "@/lib/use-data"
import type { BookingTransportRequest, PackageDetail, QuoteLineItem, SupplierKind } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"
import { PresenceAvatars } from "@/components/presence-avatars"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { CommissionControl, type CommissionControlValue } from "@/components/supplier/commission-control"
import { CommissionBadge } from "@/components/quotes/commission-badge"
import { QuoteLineSupplierPicker, type QuoteExtraSelection } from "@/components/quote-line-supplier-picker"
import { getDestinationLocationIds } from "@/lib/packages/location-filter"
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

interface BuildBookingDialogProps {
  jobId: string
  quoteId: string
  travelDate: string | null
  existingLineItemCount: number
  /** Existing quote lines — manual/extra lines (snapshot.isExtra) are preserved across re-apply. */
  existingLineItems?: QuoteLineItem[]
  expectedUpdatedAt?: string
  /** Customer's default rate type — pre-selects the rate version when pricing. */
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

interface ServiceRow {
  key: string
  legId?: string
  supplierId: string
  supplierKind: SupplierKind
  supplierName: string
}

interface BuildBookingResponse {
  packageId: string
  slug: string
  packageDetail: PackageDetail
}

type Step = "services" | "configure" | "confirm"

interface LegCommissionState {
  value: CommissionControlValue
  show: boolean
}

export function BuildBookingDialog({
  jobId,
  quoteId,
  travelDate,
  existingLineItemCount,
  existingLineItems = [],
  expectedUpdatedAt,
  customerDefaultRateTypeId,
  onApplied,
}: BuildBookingDialogProps) {
  const { data: suppliers = [] } = useActiveSuppliers()
  const { data: rateTypesData } = useRateTypes()
  const rateTypes = (rateTypesData?.rateTypes ?? []).filter((rt) => !rt.archivedAt)
  const systemDefaultRateTypeId = rateTypes.find((rt) => rt.isDefault)?.id ?? ""
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("services")
  const [services, setServices] = useState<ServiceRow[]>([])
  const [pickerKind, setPickerKind] = useState<SupplierKind>("train_operator")
  const [pickerSupplierId, setPickerSupplierId] = useState("")
  const [packageSlug, setPackageSlug] = useState<string | null>(null)
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [building, setBuilding] = useState(false)
  const [savedState, setSavedState] = useState<SavedPackageState | null>(null)
  const [existingTransportRequests, setExistingTransportRequests] = useState<BookingTransportRequest[]>([])
  const [legStates, setLegStates] = useState<ApplyLegState[]>([])
  const [totalsBySupplierId, setTotalsBySupplierId] = useState<Record<string, PassengerTotals>>({})
  const [commissionByLegId, setCommissionByLegId] = useState<Record<string, LegCommissionState>>({})
  const [rateTypeId, setRateTypeId] = useState("")
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [extras, setExtras] = useState<QuoteExtraSelection[]>([])
  const [validating, setValidating] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
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

  const filteredSuppliers = suppliers.filter((supplier) => supplier.kind === pickerKind)

  useEffect(() => {
    setEditing(open && step !== "services")
  }, [open, setEditing, step])

  // Backfill the rate type once it resolves, if the picker is still empty
  // (rate types may load after the configure step opens).
  useEffect(() => {
    if (step === "configure" && !rateTypeId) {
      const fallback = customerDefaultRateTypeId || systemDefaultRateTypeId
      if (fallback) setRateTypeId(fallback)
    }
  }, [step, rateTypeId, customerDefaultRateTypeId, systemDefaultRateTypeId])

  // Load the booking's saved services when the dialog opens, so re-opening pre-fills everything
  // the last build persisted.
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
        const saved: SavedPackageState | null = packageRes.ok
          ? ((await packageRes.json()) as SavedPackageState)
          : null
        setSavedState(saved)
        setExistingTransportRequests(
          transportRes.ok ? ((await transportRes.json()) as BookingTransportRequest[]) : [],
        )

        if (saved?.packageId) {
          const buildRes = await fetch(`/api/jobs/${jobId}/build-booking`)
          if (!cancelled && buildRes.ok) {
            const built = (await buildRes.json()) as { slug: string | null; packageDetail: PackageDetail | null }
            if (built.packageDetail && built.slug) {
              setPackageDetail(built.packageDetail)
              setPackageSlug(built.slug)
              setServices(
                built.packageDetail.legs
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((leg) => ({
                    key: leg.id,
                    legId: leg.id,
                    supplierId: leg.supplierId,
                    supplierKind: leg.supplierKind,
                    supplierName: leg.supplierName,
                  })),
              )
            }
          }
        }
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
  }, [open, jobId, travelDate])

  const sortedLegs = useMemo(
    () => (packageDetail?.legs ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [packageDetail],
  )

  function reset() {
    setStep("services")
    setServices([])
    setPickerKind("train_operator")
    setPickerSupplierId("")
    setPackageSlug(null)
    setPackageDetail(null)
    setLegStates([])
    setTotalsBySupplierId({})
    setCommissionByLegId({})
    setRateTypeId("")
    setPreviewLineItems([])
    setExtras([])
    setBuildError(null)
    setValidationErrors([])
    clearQuoteConflict()
  }

  const destinationLocationIds = packageDetail ? getDestinationLocationIds(packageDetail.legs) : []
  // Manual/extra lines added previously survive a rebuild; new extras come back in the preview.
  const preservedExtras = existingLineItems.filter((li) => li.pricingSnapshot?.isExtra === true)
  const lineItemsToSave = [...previewLineItems, ...preservedExtras]

  function addService() {
    const supplier = suppliers.find((s) => s.id === pickerSupplierId)
    if (!supplier) return
    setServices((prev) => [
      ...prev,
      { key: crypto.randomUUID(), supplierId: supplier.id, supplierKind: supplier.kind, supplierName: supplier.name },
    ])
    setPickerSupplierId("")
  }

  function removeService(key: string) {
    setServices((prev) => prev.filter((service) => service.key !== key))
  }

  function moveService(index: number, direction: -1 | 1) {
    setServices((prev) => {
      const next = prev.slice()
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function buildServices() {
    if (services.length === 0) {
      setBuildError("Add at least one service")
      return
    }

    setBuilding(true)
    setBuildError(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/build-booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: services.map((service) => ({
            legId: service.legId,
            supplierId: service.supplierId,
            supplierKind: service.supplierKind,
          })),
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setBuildError(typeof payload?.error === "string" ? payload.error : "Failed to build booking services")
        return
      }
      const built = payload as BuildBookingResponse
      setPackageSlug(built.slug)
      setPackageDetail(built.packageDetail)

      const splitSupplierIds = Array.from(
        new Set(
          built.packageDetail.legs
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

      // The job's enquiry travel date seeds default service dates; everything stays editable.
      const stateOptions = { tripStartDate: savedState?.tripStartDate ?? travelDate ?? null, totalsBySupplierId: totals }
      const savedLegIds = new Set((savedState?.selections ?? []).map((row) => row.package_leg_id))
      const states =
        savedState && savedState.packageId === built.packageId
          ? hydrateFromSaved(built.packageDetail, savedState, existingTransportRequests, stateOptions)
          : buildDefaultLegStates(built.packageDetail, stateOptions)
      // Every service the salesperson explicitly added should start selected — unlike the
      // predefined-package flow (which defaults optional legs to unselected), a leg the user
      // just picked here has no "optional" concept; only respect an existing saved deselection.
      setLegStates(states.map((state) => (savedLegIds.has(state.legId) ? state : { ...state, selected: true })))
      setCommissionByLegId({})
      setRateTypeId(customerDefaultRateTypeId || systemDefaultRateTypeId || "")
      setStep("configure")
    } catch {
      setBuildError("Failed to build booking services. Please try again.")
    } finally {
      setBuilding(false)
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
    if (!packageSlug || !packageDetail) return

    const problems = validateConfigureState(packageDetail, legStates, { totalsBySupplierId })
    // Pricing needs at least one dated service (rate cards match on the derived trip start).
    const derivedRange = deriveTripDateRangeFromStates(packageDetail, legStates)
    if (problems.length === 0 && !derivedRange.start) {
      problems.push("Add a date to at least one service — trip dates are worked out from them")
    }
    setValidationErrors(problems)
    if (problems.length > 0) return

    setValidating(true)
    setBuildError(null)

    try {
      // 1. Persist per-leg selections and suite units (voucher generation reads these).
      const patchRes = await fetch(`/api/jobs/${jobId}/package-selections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPackageSelectionsPatch(legStates)),
      })
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => ({}))
        setBuildError(`Could not save service selections: ${body.error ?? patchRes.statusText}`)
        return
      }

      // 2. Persist transport requests — pricing reads them from the DB in the next step.
      const transportPut = toTransportRequestsPut(legStates, existingTransportRequests)
      const transportRes = await fetch(`/api/jobs/${jobId}/transport-requests`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transportPut),
      })
      if (!transportRes.ok) {
        const body = await transportRes.json().catch(() => ({}))
        setBuildError(`Could not save transport details: ${body.error ?? transportRes.statusText}`)
        return
      }
      const savedTransportRows = (await transportRes.json().catch(() => null)) as
        | BookingTransportRequest[]
        | null
      if (savedTransportRows) setExistingTransportRequests(savedTransportRows)

      // 3. Price the quote from the persisted configuration.
      const commissionOverrides: Record<string, ApplyCommissionOverride | null> = {}
      for (const [legId, state] of Object.entries(commissionByLegId)) {
        const override = state.value
        commissionOverrides[legId] =
          override.type !== null && override.value !== null && Number.isFinite(override.value)
            ? { type: override.type, value: override.value }
            : null
      }

      const res = await fetch(`/api/packages/${packageSlug}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          quoteId,
          travelDate: derivedRange.start,
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
        setBuildError(typeof payload?.error === "string" ? payload.error : "Validation failed")
        return
      }
      setPreviewLineItems(payload.lineItems as QuoteLineItem[])
      setStep("confirm")
    } catch {
      setBuildError("Failed to validate pricing. Please try again.")
    } finally {
      setValidating(false)
    }
  }

  async function applyToQuote(options?: { ignoreExpectedUpdatedAt: boolean }) {
    if (previewLineItems.length === 0) return
    try {
      await saveQuote({ lineItems: lineItemsToSave }, options)
      toast.success("Booking services applied to quote")
      setOpen(false)
      reset()
      onApplied()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply booking services"
      setBuildError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Boxes className="mr-2 h-4 w-4" />
          Build booking
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        {step === "services" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Build this booking&apos;s services
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                Add each service the customer is booking — train, hotel, transfers, rentals — then
                configure the fine detail and price the quote.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto]">
              <Select value={pickerKind} onValueChange={(value) => setPickerKind(value as SupplierKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUPPLIER_KIND_LABELS).map(([kind, label]) => (
                    <SelectItem key={kind} value={kind}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={pickerSupplierId || undefined} onValueChange={setPickerSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {filteredSuppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={addService} disabled={!pickerSupplierId}>
                Add service
              </Button>
            </div>

            <div className="space-y-2">
              {services.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No services added yet</p>
              ) : (
                services.map((service, index) => (
                  <div key={service.key} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{service.supplierName}</span>
                      <Badge variant="secondary">{SUPPLIER_KIND_LABELS[service.supplierKind]}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === 0}
                        onClick={() => moveService(index, -1)}
                        aria-label="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        disabled={index === services.length - 1}
                        onClick={() => moveService(index, 1)}
                        aria-label="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeService(service.key)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {buildError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {buildError}
              </p>
            )}

            <DialogFooter>
              <Button onClick={buildServices} disabled={building || services.length === 0}>
                {building ? "Saving…" : "Next"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "configure" && packageDetail && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Configure services
                <PresenceAvatars users={others} />
              </DialogTitle>
              <DialogDescription>
                Fill in the fine detail for each service. Saving here updates the booking and prices
                the quote. Trip dates are worked out from the service dates.
              </DialogDescription>
            </DialogHeader>

            <TripDateSummary detail={packageDetail} states={legStates} />

            {rateTypes.length > 0 && (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="build-rate-type">Rate type</Label>
                <Select value={rateTypeId} onValueChange={setRateTypeId}>
                  <SelectTrigger id="build-rate-type" className="h-9">
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
                  Applies to every service; a service without this rate falls back to the default.
                </p>
              </div>
            )}

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
                  Add anything else the client requested — e.g. an extra hotel, transfer, or rental.
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

            {buildError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {buildError}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep("services"); setBuildError(null); setValidationErrors([]) }}>
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
                  ? `This replaces the service lines${
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
