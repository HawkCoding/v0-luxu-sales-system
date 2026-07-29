"use client"

import { useEffect, useMemo, useState } from "react"
import { Boxes, ChevronDown, ChevronUp, Percent, TriangleAlert } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useActiveSuppliers, useRateTypes } from "@/lib/use-data"
import type { BookingTransportRequest, CommissionKind, PackageDetail, QuoteLineItem, SupplierKind } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"
import { PresenceAvatars } from "@/components/presence-avatars"
import { formatCurrency } from "@/lib/utils"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { CommissionControl, type CommissionControlValue } from "@/components/supplier/commission-control"
import { CommissionBadge } from "@/components/quotes/commission-badge"
import { SuiteLegEditor } from "@/components/packages/suite-leg-editor"
import { TransportLegEditor } from "@/components/packages/transport-leg-editor"
import { TripDateSummary } from "@/components/packages/trip-date-summary"
import { TravellerCountsEditor, type TravellerCounts } from "@/components/bookings/traveller-counts-editor"
import { resolveAdultsOnlyDelta, type PassengerTotals } from "@/lib/packages/passenger-totals"
import type { AgeBuckets } from "@/lib/pricing/age-buckets"
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
  /** Opens the dialog immediately on mount — used to skip the extra click right after a quote is created. */
  autoOpen?: boolean
  onAutoOpenHandled?: () => void
}

interface QuotePatchPayload {
  lineItems: QuoteLineItem[]
}

interface QuotePatchResponse {
  id: string
  subtotal: number
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
  packageDetail: PackageDetail
}

type Step = "services" | "configure" | "confirm"

const EMPTY_COMMISSION: CommissionControlValue = { type: null, value: null }

/** The booking's commission is a required step — one value applied to every service line.
 * Returns null while it is still unset, which is what blocks the configure step's Next. */
function resolveCommissionValue(value: CommissionControlValue): ApplyCommissionOverride | null {
  const { type, value: amount } = value
  if (type === null || amount === null || !Number.isFinite(amount) || amount < 0) return null
  return { type, value: amount }
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
  autoOpen = false,
  onAutoOpenHandled,
}: BuildBookingDialogProps) {
  const { data: suppliers = [] } = useActiveSuppliers()
  const { data: rateTypesData } = useRateTypes()
  const rateTypes = useMemo(
    () => (rateTypesData?.rateTypes ?? []).filter((rt) => !rt.archivedAt),
    [rateTypesData],
  )
  const systemDefaultRateTypeId = rateTypes.find((rt) => rt.isDefault)?.id ?? ""
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("services")
  const [services, setServices] = useState<ServiceRow[]>([])
  const [pickerKind, setPickerKind] = useState<SupplierKind>("train_operator")
  const [pickerSupplierId, setPickerSupplierId] = useState("")
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  const [building, setBuilding] = useState(false)
  const [savedState, setSavedState] = useState<SavedPackageState | null>(null)
  const [existingTransportRequests, setExistingTransportRequests] = useState<BookingTransportRequest[]>([])
  const [legStates, setLegStates] = useState<ApplyLegState[]>([])
  const [totalsBySupplierId, setTotalsBySupplierId] = useState<Record<string, PassengerTotals>>({})
  const [bucketsBySupplierId, setBucketsBySupplierId] = useState<Record<string, AgeBuckets>>({})
  const [bookingCounts, setBookingCounts] = useState<TravellerCounts | null>(null)
  const [commission, setCommission] = useState<CommissionControlValue>(EMPTY_COMMISSION)
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const [validating, setValidating] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [confirmingServices, setConfirmingServices] = useState(false)
  const [syncingTotals, setSyncingTotals] = useState(false)
  const [editingTravellers, setEditingTravellers] = useState(false)
  const [travellerDraft, setTravellerDraft] = useState<TravellerCounts | null>(null)
  const [savingTravellers, setSavingTravellers] = useState(false)
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
  const defaultRateTypeId = customerDefaultRateTypeId || systemDefaultRateTypeId || null

  useEffect(() => {
    setEditing(open && step !== "services")
  }, [open, setEditing, step])

  useEffect(() => {
    if (!autoOpen) return
    setOpen(true)
    onAutoOpenHandled?.()
  }, [autoOpen, onAutoOpenHandled])

  // Reconcile per-leg rate types once the rate-type list resolves (it may load after
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
  }, [step, defaultRateTypeId, rateTypes])

  // Re-opening the dialog on a priced quote pre-fills the commission from what the existing
  // lines were built with, so the salesperson doesn't have to remember and retype it.
  useEffect(() => {
    if (!open) return
    const saved = existingLineItems.find((li) => li.pricingSnapshot?.commission)?.pricingSnapshot
      ?.commission
    if (!saved || saved.type === null) return
    setCommission((prev) => (prev.type === null && prev.value === null ? { type: saved.type, value: saved.value } : prev))
  }, [open, existingLineItems])

  // On a quote with nothing to read a commission back off, start from the house default set in
  // Settings. It stays fully editable -- this only stops an unset required field from blocking
  // the configure step on every new booking.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/settings/commission")
        if (!res.ok || cancelled) return
        const { defaultCommission } = (await res.json()) as {
          defaultCommission: { type: CommissionKind; value: number } | null
        }
        if (!defaultCommission || cancelled) return
        setCommission((prev) =>
          prev.type === null && prev.value === null
            ? { type: defaultCommission.type, value: defaultCommission.value }
            : prev,
        )
      } catch {
        // A missing default is not an error -- the field simply stays empty as before.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  // Load the booking's saved services when the dialog opens, so re-opening pre-fills everything
  // the last build persisted.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [servicesRes, transportRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}/services`),
          fetch(`/api/jobs/${jobId}/transport-requests`),
        ])
        if (cancelled) return
        const saved: SavedPackageState | null = servicesRes.ok
          ? ((await servicesRes.json()) as SavedPackageState)
          : null
        setSavedState(saved)
        setExistingTransportRequests(
          transportRes.ok ? ((await transportRes.json()) as BookingTransportRequest[]) : [],
        )

        // The GET here is cheap and returns packageDetail: null when nothing has been built yet,
        // so there is no need to gate it behind savedState the way a real catalogue package id
        // once required.
        const buildRes = await fetch(`/api/jobs/${jobId}/build-booking`)
        if (!cancelled && buildRes.ok) {
          const built = (await buildRes.json()) as { packageDetail: PackageDetail | null }
          if (built.packageDetail) {
            setPackageDetail(built.packageDetail)
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

  // Surfaced next to the blocking validation error too — hitting Next with a stale booking total
  // shouldn't be a dead end; the fix is one click away right where the error is shown.
  const mismatchedSplitLegs = useMemo(() => {
    const legById = new Map(sortedLegs.map((leg) => [leg.id, leg]))
    return legStates.flatMap((state) => {
      if (state.kind !== "suite" || !state.selected) return []
      const leg = legById.get(state.legId)
      if (!leg || !PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)) return []
      const totals = totalsBySupplierId[leg.supplierId]
      if (!totals) return []
      const summed = state.units.reduce(
        (acc, unit) => ({
          adultCount: acc.adultCount + unit.adultCount,
          childCount: acc.childCount + unit.childCount,
          infantCount: acc.infantCount + unit.infantCount,
        }),
        { adultCount: 0, childCount: 0, infantCount: 0 },
      )
      if (summed.adultCount === totals.adultCount && summed.childCount === totals.childCount && summed.infantCount === totals.infantCount) {
        return []
      }
      return [{ legId: leg.id, label: leg.label ?? leg.supplierName, supplierId: leg.supplierId, summed }]
    })
  }, [sortedLegs, legStates, totalsBySupplierId])

  function reset() {
    setStep("services")
    setServices([])
    setPickerKind("train_operator")
    setPickerSupplierId("")
    setPackageDetail(null)
    setLegStates([])
    setTotalsBySupplierId({})
    setBucketsBySupplierId({})
    setBookingCounts(null)
    setCommission(EMPTY_COMMISSION)
    setPreviewLineItems([])
    setBuildError(null)
    setValidationErrors([])
    setEditingTravellers(false)
    setTravellerDraft(null)
    clearQuoteConflict()
  }

  const resolvedCommission = resolveCommissionValue(commission)
  // Manual/extra lines added previously survive a rebuild.
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
      setPackageDetail(built.packageDetail)

      const totals = await refreshPassengerTotals(built.packageDetail)

      // The job's enquiry travel date seeds default service dates; everything stays editable.
      const stateOptions = {
        tripStartDate: savedState?.tripStartDate ?? travelDate ?? null,
        totalsBySupplierId: totals,
        defaultRateTypeId,
      }
      const savedLegIds = new Set((savedState?.selections ?? []).map((row) => row.package_leg_id))
      const states =
        savedState && savedState.selections.length > 0
          ? hydrateFromSaved(built.packageDetail, savedState, existingTransportRequests, stateOptions)
          : buildDefaultLegStates(built.packageDetail, stateOptions)
      // Every service the salesperson explicitly added should start selected — unlike the
      // predefined-package flow (which defaults optional legs to unselected), a leg the user
      // just picked here has no "optional" concept; only respect an existing saved deselection.
      setLegStates(states.map((state) => (savedLegIds.has(state.legId) ? state : { ...state, selected: true })))
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
    // Any edit clears the "Auto-filled" chip immediately -- onChange only ever fires on a genuine
    // field change, never a re-render, so flipping origin unconditionally here is safe. The PATCH
    // /api/jobs/[id]/services save persists the same flip server-side.
    const edited: ApplyLegState = next.origin === "auto" ? { ...next, origin: "consultant" } : next
    setLegStates((prev) => {
      const merged = prev.map((state) => (state.legId === edited.legId ? edited : state))
      return packageDetail ? applyAnchoredHotelDates(packageDetail, merged) : merged
    })
  }

  function hotelAnchorContext(legId: string): HotelAnchorContext | null {
    if (!packageDetail) return null
    return toHotelAnchorContext(packageDetail, legStates, legId)
  }

  const hasAutoFilledServices = legStates.some((state) => state.origin === "auto")

  async function confirmServices() {
    setConfirmingServices(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/services/confirm`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(typeof body?.error === "string" ? body.error : "Failed to confirm services")
        return
      }
      setLegStates((prev) => prev.map((state) => ({ ...state, origin: "consultant" })))
      toast.success("Services confirmed")
    } catch {
      toast.error("Failed to confirm services. Please try again.")
    } finally {
      setConfirmingServices(false)
    }
  }

  async function refreshPassengerTotals(detail: PackageDetail): Promise<Record<string, PassengerTotals>> {
    const splitSupplierIds = Array.from(
      new Set(
        detail.legs
          .filter((leg) => PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind))
          .map((leg) => leg.supplierId),
      ),
    )
    if (splitSupplierIds.length === 0) {
      setTotalsBySupplierId({})
      setBucketsBySupplierId({})
      return {}
    }
    const totalsRes = await fetch(`/api/jobs/${jobId}/passenger-totals?supplierIds=${splitSupplierIds.join(",")}`)
    if (!totalsRes.ok) return totalsBySupplierId
    const data = (await totalsRes.json()) as {
      totalsBySupplierId: Record<string, PassengerTotals>
      bucketsBySupplierId: Record<string, AgeBuckets>
      booking: TravellerCounts
    }
    setTotalsBySupplierId(data.totalsBySupplierId)
    setBucketsBySupplierId(data.bucketsBySupplierId)
    setBookingCounts(data.booking)
    return data.totalsBySupplierId
  }

  // A customer adding/removing travellers after the quote's first draft shouldn't require the
  // salesperson to leave this dialog and hunt down the enquiry tab. Adults-only is the simple,
  // always-convergent case: since child_ages (and therefore how many children get promoted to
  // adults) doesn't change, `noOfAdults + delta` re-projects to exactly what the suites hold —
  // see resolveAdultsOnlyDelta. Children/infants have no such shortcut; they're only reachable by
  // editing the age roster below, because that's what the projection actually derives them from.
  async function setBookingAdults(nextAdults: number) {
    setSyncingTotals(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedFieldEdits: { noOfAdults: nextAdults } }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(typeof body?.error === "string" ? body.error : "Failed to update booking total")
        return
      }
      if (packageDetail) await refreshPassengerTotals(packageDetail)
      toast.success("Booking traveller total updated")
    } catch {
      toast.error("Failed to update booking total. Please try again.")
    } finally {
      setSyncingTotals(false)
    }
  }

  async function saveTravellerCounts(next: TravellerCounts) {
    setSavingTravellers(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedFieldEdits: {
            noOfAdults: next.noOfAdults,
            noOfChildren: next.noOfChildren,
            childAges: next.childAges.length > 0 ? next.childAges : null,
          },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(typeof body?.error === "string" ? body.error : "Failed to update travellers")
        return
      }
      if (packageDetail) await refreshPassengerTotals(packageDetail)
      setEditingTravellers(false)
      toast.success("Booking travellers updated")
    } catch {
      toast.error("Failed to update travellers. Please try again.")
    } finally {
      setSavingTravellers(false)
    }
  }

  async function validateAndPreview() {
    if (!packageDetail) return

    const problems = validateConfigureState(packageDetail, legStates, { totalsBySupplierId })
    // Pricing needs at least one dated service (rate cards match on the derived trip start).
    const derivedRange = deriveTripDateRangeFromStates(packageDetail, legStates)
    if (problems.length === 0 && !derivedRange.start) {
      problems.push("Add a date to at least one service — trip dates are worked out from them")
    }
    if (!resolvedCommission) {
      problems.push("Set the commission for this booking — enter 0 if no commission applies")
    }
    setValidationErrors(problems)
    if (problems.length > 0) return

    setValidating(true)
    setBuildError(null)

    try {
      // 1. Persist per-leg selections and suite units (voucher generation reads these).
      const patchRes = await fetch(`/api/jobs/${jobId}/services`, {
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

      // 3. Price the quote from the persisted configuration. The booking's single commission
      // is sent per leg — the pricing engine applies commission at line level.
      const commissionOverrides: Record<string, ApplyCommissionOverride | null> = {}
      for (const state of legStates) {
        commissionOverrides[state.legId] = resolvedCommission
      }

      const res = await fetch(`/api/jobs/${jobId}/services/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          quoteId,
          travelDate: derivedRange.start,
          selections: toApplySelections(legStates, commissionOverrides),
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
          Edit Quote
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

            {mismatchedSplitLegs.length > 0 && bookingCounts && (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                  <h3 className="text-sm font-semibold">Travellers</h3>
                </div>
                <div className="space-y-2">
                  {mismatchedSplitLegs.map(({ legId, label, supplierId, summed }) => {
                    const totals = totalsBySupplierId[supplierId]
                    const delta = totals ? resolveAdultsOnlyDelta(totals, summed) : null
                    const nextAdults = delta !== null ? bookingCounts.noOfAdults + delta : null
                    return (
                      <div key={legId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p>
                          {label}: suites hold {summed.adultCount} adults, {summed.childCount} children,{" "}
                          {summed.infantCount} infants — booking is {totals?.adultCount} adults,{" "}
                          {totals?.childCount} children, {totals?.infantCount} infants.
                        </p>
                        {nextAdults !== null && nextAdults >= 0 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={syncingTotals}
                            onClick={() => setBookingAdults(nextAdults)}
                          >
                            {syncingTotals ? "Updating…" : `Set booking to ${nextAdults} adults`}
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Children/infants differ — edit ages below.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTravellerDraft(bookingCounts)
                    setEditingTravellers((prev) => !prev)
                  }}
                >
                  {editingTravellers ? "Hide traveller editor" : "Edit travellers"}
                </Button>
                {editingTravellers && travellerDraft && (
                  <div className="rounded-md border bg-background p-3">
                    <TravellerCountsEditor
                      value={travellerDraft}
                      onChange={setTravellerDraft}
                      buckets={bucketsBySupplierId[mismatchedSplitLegs[0].supplierId]}
                      disabled={savingTravellers}
                    />
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTravellers(false)}
                        disabled={savingTravellers}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveTravellerCounts(travellerDraft)}
                        disabled={savingTravellers}
                      >
                        {savingTravellers ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasAutoFilledServices && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm">
                  Some services below were filled in automatically from the enquiry. Review them, then
                  confirm — or edit any field to accept it individually.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={confirmServices} disabled={confirmingServices}>
                  {confirmingServices ? "Confirming…" : "Confirm services"}
                </Button>
              </div>
            )}

            <div className="space-y-4">
              {sortedLegs.map((leg) => {
                const state = legStates.find((candidate) => candidate.legId === leg.id)
                if (!state) return null
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
                  </div>
                )
              })}
            </div>

            <div
              className={`rounded-lg border-2 p-4 ${
                resolvedCommission ? "border-primary/40 bg-primary/5" : "border-destructive/50 bg-destructive/5"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Commission</h3>
                <Badge variant={resolvedCommission ? "secondary" : "destructive"} className="text-[10px]">
                  {resolvedCommission ? "Set" : "Required"}
                </Badge>
              </div>
              <CommissionControl
                value={commission}
                onChange={setCommission}
                isEditing
                description="Applied once to the booking's total. Enter 0 if no commission applies."
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
              <Button onClick={validateAndPreview} disabled={validating || !resolvedCommission}>
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
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">R {formatCurrency(li.unitPrice)}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">R {formatCurrency(li.total)}</td>
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
