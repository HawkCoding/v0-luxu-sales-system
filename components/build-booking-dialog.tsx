"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Boxes, Check, ChevronDown, ChevronUp, Percent, TriangleAlert } from "lucide-react"
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
import { DiscardChangesDialog } from "@/components/discard-changes-dialog"
import { useDraftAutosave } from "@/hooks/use-draft-autosave"
import { useDirtyCloseGuard } from "@/hooks/use-dirty-close-guard"
import { useUnloadGuard } from "@/hooks/use-unload-guard"
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
import { SUPPLIER_KIND_LABELS, SUPPLIER_VOCABULARY } from "@/lib/types"
import { PresenceAvatars } from "@/components/presence-avatars"
import { isMissingPricing } from "@/lib/quotes/pricing-engine"
import type { IncompleteLeg } from "@/lib/quotes/build-from-package"
import { useRecordPresence } from "@/hooks/use-record-presence"
import { useVersionedSave } from "@/hooks/use-versioned-save"
import { appendFieldDetails } from "@/lib/format-error-details"
import { CommissionControl, type CommissionControlValue } from "@/components/supplier/commission-control"
import { CommissionBadge } from "@/components/quotes/commission-badge"
import { SuiteLegEditor } from "@/components/packages/suite-leg-editor"
import { TransportLegEditor } from "@/components/packages/transport-leg-editor"
import { FxRateBanner } from "@/components/quotes/fx-rate-banner"
import { FxProvenanceNote } from "@/components/quotes/fx-provenance-note"
import { RoomOverrideNote } from "@/components/quotes/room-override-note"
import { TransportOverrideNote } from "@/components/quotes/transport-override-note"
import { TourOverrideNote } from "@/components/quotes/tour-override-note"
import { useFxRates } from "@/lib/fx/use-fx-rates"
import { BASE_CURRENCY, formatMoney } from "@/lib/money"
import { formatDisplayDateTime } from "@/lib/date-format"
import { TripDateSummary } from "@/components/packages/trip-date-summary"
import { TravellerCountsEditor, type TravellerCounts } from "@/components/bookings/traveller-counts-editor"
import { resolveAdultsOnlyDelta, type PassengerTotals } from "@/lib/packages/passenger-totals"
import type { AgeBuckets } from "@/lib/pricing/age-buckets"
import { deriveTripDateRangeFromStates, dateOnly } from "@/lib/packages/trip-date-range"
import { findRateCardCandidates, selectRateCard } from "@/lib/rate-cards/resolve"
import {
  applyAnchoredDates,
  buildDefaultLegStates,
  hydrateFromSaved,
  PASSENGER_SPLIT_SUPPLIER_KINDS,
  PASSENGER_SUM_SUPPLIER_KINDS,
  toApplySelections,
  toHotelAnchorContext,
  toPackageSelectionsPatch,
  toTransferAnchorContext,
  toTransportRequestsPut,
  validateConfigureState,
  type ApplyCommissionOverride,
  type ApplyLegState,
  type HotelAnchorContext,
  type SavedPackageState,
  type SavedSelectionRow,
  type TransferAnchorContext,
} from "@/lib/packages/apply-dialog-state"
import { Skeleton } from "@/components/ui/skeleton"

interface BuildBookingDialogProps {
  jobId: string
  quoteId: string
  /** The currency this quote is denominated in. Foreign supplier rates convert into it. */
  quoteCurrency?: string
  travelDate: string | null
  existingLineItemCount: number
  /** Existing quote lines — manual/extra lines (snapshot.isExtra) are preserved across re-apply. */
  existingLineItems?: QuoteLineItem[]
  expectedUpdatedAt?: string
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

/**
 * Step 1 renders nothing but a supplier name and kind per row, and GET /api/jobs/[id]/services now
 * carries both -- so the list can paint off that fast read instead of blocking on the much heavier
 * GET /build-booking payload (every route, rate card and suite type for every supplier), which only
 * step 2 actually consumes.
 *
 * A row whose supplier didn't resolve is dropped rather than rendered as "Unknown": build-booking's
 * response replaces this list wholesale when it lands, so a placeholder would only ever flicker.
 */
function savedSelectionsToServiceRows(selections: readonly SavedSelectionRow[]): ServiceRow[] {
  return selections
    .filter(
      (row): row is SavedSelectionRow & { supplier_id: string; supplier_kind: SupplierKind } =>
        Boolean(row.supplier_id) &&
        Boolean(row.supplier_name) &&
        Boolean(row.supplier_kind && row.supplier_kind in SUPPLIER_KIND_LABELS),
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((row) => ({
      key: row.package_leg_id,
      legId: row.package_leg_id,
      supplierId: row.supplier_id,
      supplierKind: row.supplier_kind,
      supplierName: row.supplier_name as string,
    }))
}

interface BuildBookingResponse {
  packageDetail: PackageDetail
}

type Step = "services" | "configure" | "confirm"

const EMPTY_COMMISSION: CommissionControlValue = { type: null, value: null }

/**
 * The slice of this dialog's state that is worth recovering after a refresh, crash, or accidental
 * dismissal. Everything else (`packageDetail`, `previewLineItems`, `incompleteLegs`, totals) is
 * server-derived and gets refetched/rebuilt on open, so persisting it would just risk going stale.
 *
 * Bump `QUOTE_DRAFT_SCHEMA_VERSION` whenever this shape changes — see `lib/drafts/draft-storage.ts`
 * for why: a draft written under an old shape is dropped rather than restored with `undefined` gaps.
 */
interface QuoteBuilderDraft {
  step: Step
  services: ServiceRow[]
  legStates: ApplyLegState[]
  commission: CommissionControlValue
  travellerDraft: TravellerCounts | null
}

const QUOTE_DRAFT_SCHEMA_VERSION = 1

// Stable module-level reference -- an inline object literal here would get a new identity every
// render and restart the autosave hook's debounce on every unrelated re-render.
const EMPTY_QUOTE_DRAFT: QuoteBuilderDraft = {
  step: "services",
  services: [],
  legStates: [],
  commission: EMPTY_COMMISSION,
  travellerDraft: null,
}

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
  quoteCurrency = BASE_CURRENCY,
  travelDate,
  existingLineItemCount,
  existingLineItems = [],
  expectedUpdatedAt,
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
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("services")
  const [services, setServices] = useState<ServiceRow[]>([])
  const [pickerKind, setPickerKind] = useState<SupplierKind>("train_operator")
  const [pickerSupplierId, setPickerSupplierId] = useState("")
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null)
  /** True while the open-time load is in flight. Step 1 used to render "No services added yet"
   *  for the whole wait, which on a booking that does have services reads as broken rather than
   *  slow. */
  const [initialLoading, setInitialLoading] = useState(false)
  const [building, setBuilding] = useState(false)
  const [savedState, setSavedState] = useState<SavedPackageState | null>(null)
  /** Who accepted the built service list and when — until this was surfaced, a confirmed list was
   * indistinguishable from one that was never auto-built. */
  const [confirmedStamp, setConfirmedStamp] = useState<{ at: string; by: string | null } | null>(null)
  /** Legs the preview could not price because they are still unconfigured. The preview shows the
   * rest; applying to the quote stays blocked until this is empty. */
  const [incompleteLegs, setIncompleteLegs] = useState<IncompleteLeg[]>([])
  const [existingTransportRequests, setExistingTransportRequests] = useState<BookingTransportRequest[]>([])
  const [legStates, setLegStates] = useState<ApplyLegState[]>([])
  const [totalsBySupplierId, setTotalsBySupplierId] = useState<Record<string, PassengerTotals>>({})
  const [bucketsBySupplierId, setBucketsBySupplierId] = useState<Record<string, AgeBuckets>>({})
  const [bookingCounts, setBookingCounts] = useState<TravellerCounts | null>(null)
  const [commission, setCommission] = useState<CommissionControlValue>(EMPTY_COMMISSION)
  const [previewLineItems, setPreviewLineItems] = useState<QuoteLineItem[]>([])
  const { rates: fxRates, asOf: fxAsOf, stale: fxStale, refresh: refreshFxRates, setRate: setFxRate } =
    useFxRates(open)
  const [validating, setValidating] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
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

  // Draft autosave: mirrors the persistable slice of this dialog's state to localStorage so a
  // refresh, crash, or accidental dismissal doesn't throw away typing that hasn't reached the
  // configure step's "Next" (the first point any of this is saved server-side).
  const currentQuoteDraftData: QuoteBuilderDraft = { step, services, legStates, commission, travellerDraft }
  const {
    pendingDraft: pendingQuoteDraft,
    pendingDraftRecordUpdatedAt: pendingQuoteDraftRecordUpdatedAt,
    hasLoadedDraft: hasLoadedQuoteDraft,
    isDirty: quoteDraftDirty,
    discardDraft: discardQuoteDraft,
  } = useDraftAutosave<QuoteBuilderDraft>({
    kind: "quote",
    recordId: quoteId,
    version: QUOTE_DRAFT_SCHEMA_VERSION,
    enabled: open,
    data: currentQuoteDraftData,
    baseline: EMPTY_QUOTE_DRAFT,
    recordUpdatedAt: expectedUpdatedAt ?? null,
  })
  const draftAppliedRef = useRef(false)
  // A draft found for a quote someone else has since saved (`expectedUpdatedAt` moved on) is offered
  // rather than silently overlaid -- see the banner rendered near the top of DialogContent below.
  const [staleQuoteDraft, setStaleQuoteDraft] = useState<QuoteBuilderDraft | null>(null)
  useUnloadGuard(quoteDraftDirty)
  const closeGuard = useDirtyCloseGuard({
    isDirty: quoteDraftDirty,
    onConfirmedClose: () => {
      discardQuoteDraft()
      setOpen(false)
      reset()
    },
  })

  /** Applies a restored draft's leg configuration only if its leg ids still exist on the currently
   *  loaded package -- a leg the draft points at that no longer exists (booking rebuilt differently
   *  since the draft was taken) would otherwise silently render nothing. Returns whether the leg
   *  configuration itself was restorable; `services`/`commission`/`travellerDraft` restore either way. */
  function applyQuoteDraftToState(draft: QuoteBuilderDraft): boolean {
    const draftLegIds = draft.legStates.map((state) => state.legId)
    const availableLegIds = new Set((packageDetail?.legs ?? []).map((leg) => leg.id))
    const legStatesRestorable =
      draft.legStates.length === 0 ||
      (packageDetail !== null && draftLegIds.every((id) => availableLegIds.has(id)))

    if (draft.services.length > 0) setServices(draft.services)
    if (draft.commission.type !== null) setCommission(draft.commission)
    if (draft.travellerDraft) setTravellerDraft(draft.travellerDraft)

    if (legStatesRestorable && draft.legStates.length > 0) {
      setLegStates(draft.legStates)
      // "confirm" needs previewLineItems, which isn't persisted (it's re-derived server-side) --
      // land one step back and let Next regenerate it.
      setStep(draft.step === "confirm" ? "configure" : draft.step)
      return true
    }
    return false
  }

  // Reset the per-open restore guard, and offer whatever draft is on disk once it's loaded. Waits
  // for `packageDetail` when the draft has leg configuration to restore, since leg ids are only
  // resolvable once the dialog's own "load saved services" effect below has populated it.
  useEffect(() => {
    if (!open) {
      draftAppliedRef.current = false
      setStaleQuoteDraft(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || draftAppliedRef.current || !hasLoadedQuoteDraft) return
    const draft = pendingQuoteDraft
    if (!draft) {
      draftAppliedRef.current = true
      return
    }

    const recordMoved =
      pendingQuoteDraftRecordUpdatedAt !== null &&
      expectedUpdatedAt !== undefined &&
      pendingQuoteDraftRecordUpdatedAt !== expectedUpdatedAt
    if (recordMoved) {
      draftAppliedRef.current = true
      setStaleQuoteDraft(draft)
      return
    }

    if (draft.legStates.length > 0 && packageDetail === null) return // wait for packageDetail to load

    draftAppliedRef.current = true
    const restoredLegs = applyQuoteDraftToState(draft)
    if (restoredLegs) {
      toast.success("Restored your unsaved quote changes.", {
        action: { label: "Undo", onClick: () => { discardQuoteDraft(); reset() } },
      })
    } else if (draft.services.length > 0) {
      toast.success("Restored the services you'd added — click Build to continue configuring.")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasLoadedQuoteDraft, pendingQuoteDraft, pendingQuoteDraftRecordUpdatedAt, expectedUpdatedAt, packageDetail])

  const filteredSuppliers = suppliers.filter((supplier) => supplier.kind === pickerKind)

  useEffect(() => {
    setEditing(open && step !== "services")
  }, [open, setEditing, step])

  useEffect(() => {
    if (!autoOpen) return
    setOpen(true)
    onAutoOpenHandled?.()
  }, [autoOpen, onAutoOpenHandled])

  // Clear per-leg rate types that point at an archived rate once the rate-type list resolves.
  // They fall back to "inherit" (null) rather than being substituted: an explicit choice is a hard
  // contract on the server, so silently swapping in another rate would quote a price nobody picked.
  useEffect(() => {
    if (step !== "configure" || rateTypes.length === 0) return
    const activeIds = new Set(rateTypes.map((rt) => rt.id))
    setLegStates((prev) =>
      prev.some((state) => state.rateTypeId && !activeIds.has(state.rateTypeId))
        ? prev.map((state) =>
            state.rateTypeId && !activeIds.has(state.rateTypeId)
              ? { ...state, rateTypeId: null }
              : state,
          )
        : prev,
    )
  }, [step, rateTypes])

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
  //
  // The two halves run concurrently. /build-booking is by far the slowest request here and used to
  // be chained behind the saved-state read for no reason -- it takes no input from it. Step 1 now
  // paints off the saved-state response, which carries the supplier names and kinds it needs, while
  // the payload step 2 consumes keeps loading in the background.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    // The parallel fetch introduces a race the chained version couldn't have: either half may land
    // first. packageDetail's leg list is the authoritative one, so once it has populated the list
    // the saved-state fallback must not overwrite it with its own rows.
    let detailPopulatedServices = false
    setInitialLoading(true)

    const savedTask = (async () => {
      try {
        const [servicesRes, transportRes] = await Promise.all([
          fetch(`/api/jobs/${jobId}/services`),
          fetch(`/api/jobs/${jobId}/transport-requests`),
        ])
        if (cancelled) return
        const saved: SavedPackageState | null = servicesRes.ok
          ? ((await servicesRes.json()) as SavedPackageState)
          : null
        if (cancelled) return
        setSavedState(saved)
        setConfirmedStamp(
          saved?.servicesConfirmedAt
            ? { at: saved.servicesConfirmedAt, by: saved.servicesConfirmedByName ?? null }
            : null,
        )
        setExistingTransportRequests(
          transportRes.ok ? ((await transportRes.json()) as BookingTransportRequest[]) : [],
        )
        if (cancelled || detailPopulatedServices || !saved) return
        const rows = savedSelectionsToServiceRows(saved.selections)
        if (rows.length > 0) setServices(rows)
      } catch {
        if (!cancelled) {
          setSavedState(null)
          setExistingTransportRequests([])
        }
      }
    })()

    const buildTask = (async () => {
      try {
        // Returns packageDetail: null when nothing has been built yet, so there is no need to gate
        // it behind savedState the way a real catalogue package id once required.
        const buildRes = await fetch(`/api/jobs/${jobId}/build-booking`)
        if (cancelled || !buildRes.ok) return
        const built = (await buildRes.json()) as { packageDetail: PackageDetail | null }
        if (cancelled || !built.packageDetail) return
        setPackageDetail(built.packageDetail)
        detailPopulatedServices = true
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
      } catch {
        // Step 1 still renders from the saved-state read above, and the Next click rebuilds
        // packageDetail server-side regardless -- nothing here is the only path to it.
      }
    })()

    void Promise.all([savedTask, buildTask]).then(() => {
      if (!cancelled) setInitialLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, jobId, travelDate])

  const sortedLegs = useMemo(
    () => (packageDetail?.legs ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [packageDetail],
  )

  /**
   * Currencies in play on this build that are not the quote's — i.e. the ones that will actually
   * be converted. Empty means every price is already native and the FX banner stays hidden, which
   * is the common case and must not cost the salesperson any screen space.
   *
   * Mirrors the resolution build-from-package.ts and validateConfigureState use (route + suite +
   * date + rate type → selectRateCard), not just "does this leg own a foreign card anywhere" — a
   * supplier with both a USD and a ZAR card must not flag foreign just because one of its cards
   * happens to be. A leg that isn't configured enough to resolve yet (no route/date picked)
   * contributes nothing rather than guessing, so the banner never flashes speculatively.
   */
  const foreignCurrencies = useMemo(() => {
    const legById = new Map(sortedLegs.map((leg) => [leg.id, leg]))
    const systemDefaultRateTypeId = rateTypes.find((rt) => rt.isDefault)?.id ?? null
    const found = new Set<string>()

    for (const state of legStates) {
      if (!state.selected) continue
      const leg = legById.get(state.legId)
      if (!leg) continue

      if (state.kind === "transport") {
        for (const request of state.requests) {
          if (request.priceOverride != null) {
            found.add(state.priceCurrency)
            continue
          }
          const pricingDate = dateOnly(request.pickupAt)
          if (!request.routeId || !request.suiteTypeId || !pricingDate) continue
          const candidates = findRateCardCandidates(leg.rateCards, request.routeId, request.suiteTypeId, pricingDate)
          const selection = selectRateCard(
            candidates,
            state.rateTypeId,
            leg.quoteRateTypeId,
            leg.baseRateTypeId,
            systemDefaultRateTypeId,
          )
          if (selection?.ok) found.add(selection.card.currency)
        }
        continue
      }

      if (leg.pricingMode === "manual") {
        found.add(state.priceCurrency)
        continue
      }

      if (!state.routeId || !state.serviceDate) continue
      for (const unit of state.units) {
        if (!unit.suiteTypeId) continue
        const candidates = findRateCardCandidates(leg.rateCards, state.routeId, unit.suiteTypeId, state.serviceDate)
        const selection = selectRateCard(
          candidates,
          state.rateTypeId,
          leg.quoteRateTypeId,
          leg.baseRateTypeId,
          systemDefaultRateTypeId,
        )
        if (selection?.ok) found.add(selection.card.currency)
      }
    }

    found.delete(quoteCurrency)
    return Array.from(found).sort()
  }, [sortedLegs, legStates, quoteCurrency, rateTypes])

  // Surfaced next to the blocking validation error too — hitting Next with a stale booking total
  // shouldn't be a dead end; the fix is one click away right where the error is shown.
  const mismatchedSplitLegs = useMemo(() => {
    const legById = new Map(sortedLegs.map((leg) => [leg.id, leg]))
    return legStates.flatMap((state) => {
      if (state.kind !== "suite" || !state.selected) return []
      const leg = legById.get(state.legId)
      if (!leg || !PASSENGER_SUM_SUPPLIER_KINDS.has(leg.supplierKind)) return []
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
      return [
        {
          legId: leg.id,
          label: leg.label ?? leg.supplierName,
          supplierId: leg.supplierId,
          summed,
          unitNounPlural: SUPPLIER_VOCABULARY[leg.supplierKind].unitNounPlural,
        },
      ]
    })
  }, [sortedLegs, legStates, totalsBySupplierId])

  function reset() {
    setStep("services")
    setServices([])
    setInitialLoading(false)
    setPickerKind("train_operator")
    setPickerSupplierId("")
    setPackageDetail(null)
    setLegStates([])
    setTotalsBySupplierId({})
    setBucketsBySupplierId({})
    setBookingCounts(null)
    setCommission(EMPTY_COMMISSION)
    setPreviewLineItems([])
    setIncompleteLegs([])
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
      // Legs seed with no rate type: pricing then walks the supplier's quoted rate, its base rate,
      // and finally the system default. Picking one by hand makes it a hard contract instead.
      const stateOptions = {
        primarySupplierId: savedState?.primarySupplierId ?? null,
        tripStartDate: savedState?.tripStartDate ?? travelDate ?? null,
        totalsBySupplierId: totals,
        // A new leg types its fares in the quote's own currency until told otherwise.
        quoteCurrency,
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
      // The reorder pass in build-booking bumps updated_at on every kept leg, not just moved ones;
      // legStates above still carries the pre-build stamps from the dialog's initial load, so the
      // next PATCH would 409 against a write this very build made. Re-read the fresh versions.
      await refreshLegVersions()
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
      return packageDetail ? applyAnchoredDates(packageDetail, merged) : merged
    })
  }

  function hotelAnchorContext(legId: string): HotelAnchorContext | null {
    if (!packageDetail) return null
    return toHotelAnchorContext(packageDetail, legStates, legId)
  }

  function transferAnchorContext(legId: string): TransferAnchorContext | null {
    if (!packageDetail) return null
    return toTransferAnchorContext(packageDetail, legStates, legId)
  }

  const hasAutoFilledServices = legStates.some((state) => state.origin === "auto")

  /** Re-reads booking_services.updated_at for every leg after a write this dialog made itself. */
  async function refreshLegVersions() {
    const res = await fetch(`/api/jobs/${jobId}/services`)
    if (!res.ok) return
    const saved = (await res.json().catch(() => null)) as SavedPackageState | null
    if (!saved?.selections) return
    const versionByLegId = new Map(saved.selections.map((row) => [row.package_leg_id, row.updated_at ?? null]))
    setLegStates((prev) =>
      prev.map((state) =>
        versionByLegId.has(state.legId)
          ? { ...state, updatedAt: versionByLegId.get(state.legId) ?? null }
          : state,
      ),
    )
  }

  /**
   * Records who accepted the auto-filled services and when.
   *
   * This used to be its own "Confirm services" button on the banner below,
   * which gated nothing — no pipeline gate reads `services_confirmed`. Pricing
   * the quote off these services is a far stronger acceptance than clicking a
   * button beside them, so the stamp now rides on Apply to quote instead.
   *
   * Never throws: a booking whose quote saved but whose stamp failed is a
   * missing audit row, not a failed apply.
   */
  async function stampServicesConfirmed() {
    try {
      const res = await fetch(`/api/jobs/${jobId}/services/confirm`, { method: "POST" })
      if (!res.ok) return
      const body = (await res.json().catch(() => null)) as { servicesConfirmedAt?: string } | null
      setLegStates((prev) => prev.map((state) => ({ ...state, origin: "consultant" })))
      // The confirmer's name only comes back on the next load of saved state; the stamp itself is
      // what matters here, so the line falls back to "Services confirmed <date>".
      setConfirmedStamp({ at: body?.servicesConfirmedAt ?? new Date().toISOString(), by: null })
    } catch {
      // Swallowed on purpose — see above.
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

    const problems = validateConfigureState(packageDetail, legStates, { totalsBySupplierId, rateTypes })
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
      // deferTripDateRecompute: the transport-requests PUT in step 2 below always follows and
      // recomputes trip dates from the final state of both tables -- doing it again here would
      // just be discarded work on the same request round trip.
      const patchRes = await fetch(`/api/jobs/${jobId}/services`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...toPackageSelectionsPatch(legStates), deferTripDateRecompute: true }),
      })
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => ({}))
        // A concurrent editor's save landed first. Nothing of theirs was overwritten; this dialog
        // is simply holding a stale copy, so the fix is to reopen rather than retry.
        if (patchRes.status === 409 && body?.code === "STALE_VERSION") {
          setBuildError(typeof body.error === "string" ? body.error : "This booking's services changed while you were editing.")
          return
        }
        setBuildError(`Could not save service selections: ${body.error ?? patchRes.statusText}`)
        return
      }
      // Adopt the row versions the save produced, so a second save in the same session doesn't
      // 409 against stamps this very request moved on.
      const patchBody = (await patchRes.json().catch(() => null)) as
        | { selections?: Array<{ package_leg_id: string; updated_at?: string | null }> }
        | null
      if (patchBody?.selections) {
        const versionByLegId = new Map(
          patchBody.selections.map((row) => [row.package_leg_id, row.updated_at ?? null]),
        )
        setLegStates((prev) =>
          prev.map((state) =>
            versionByLegId.has(state.legId)
              ? { ...state, updatedAt: versionByLegId.get(state.legId) ?? null }
              : state,
          ),
        )
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
          // Send the rates that were on screen so a hand-nudged rate prices the quote, rather
          // than the server silently re-deriving a different one from its cache.
          fxRates,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        const baseMessage = typeof payload?.error === "string" ? payload.error : "Validation failed"
        setBuildError(appendFieldDetails(baseMessage, payload))
        return
      }
      setPreviewLineItems(payload.lineItems as QuoteLineItem[])
      setIncompleteLegs((payload.incompleteLegs as IncompleteLeg[] | undefined) ?? [])
      setStep("confirm")
    } catch {
      setBuildError("Failed to validate pricing. Please try again.")
    } finally {
      setValidating(false)
    }
  }

  async function applyToQuote(options?: { ignoreExpectedUpdatedAt: boolean }) {
    if (previewLineItems.length === 0) return
    // The preview deliberately prices what it can; saving a quote that silently omits a leg is a
    // different matter. Guarded here as well as by the disabled button.
    if (incompleteLegs.length > 0) {
      setBuildError("Finish configuring every service before applying this to the quote.")
      return
    }
    try {
      await saveQuote({ lineItems: lineItemsToSave }, options)
      // Applying is the acceptance — stamp it rather than asking for a
      // separate click that gated nothing. Deliberately not gated on
      // `hasAutoFilledServices`: editing a field already flips that leg to
      // origin='consultant', so by the time a reviewed booking reaches Apply
      // there is usually nothing left marked auto. Only the first apply
      // stamps, so the record keeps whoever actually accepted the build.
      if (!confirmedStamp) await stampServicesConfirmed()
      toast.success("Booking services applied to quote")
      discardQuoteDraft()
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true)
          return
        }
        closeGuard.handleOpenChange(false)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Boxes className="mr-2 h-4 w-4" />
          Edit Quote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[95vw] lg:max-w-6xl" {...closeGuard.contentProps}>
        <DiscardChangesDialog
          open={closeGuard.confirming}
          onKeepEditing={closeGuard.cancelDiscard}
          onDiscard={closeGuard.confirmDiscard}
        />
        {staleQuoteDraft && (
          <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>
              You have unsaved edits to this quote from a previous session, but the quote has changed
              since then — restoring them may overwrite what changed.
            </span>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  discardQuoteDraft()
                  setStaleQuoteDraft(null)
                }}
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  applyQuoteDraftToState(staleQuoteDraft)
                  discardQuoteDraft()
                  setStaleQuoteDraft(null)
                  toast.success("Restored your unsaved quote changes.")
                }}
              >
                Restore my draft
              </Button>
            </div>
          </div>
        )}
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
              <Select value={pickerSupplierId || ""} onValueChange={setPickerSupplierId}>
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
              {initialLoading && services.length === 0 ? (
                <div className="space-y-2" aria-busy="true">
                  <span className="sr-only" role="status">
                    Loading this booking&apos;s services…
                  </span>
                  {[0, 1, 2].map((row) => (
                    <Skeleton key={row} className="h-[58px] w-full rounded-lg" />
                  ))}
                </div>
              ) : services.length === 0 ? (
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

            <FxRateBanner
              foreignCurrencies={foreignCurrencies}
              quoteCurrency={quoteCurrency}
              rates={fxRates}
              asOf={fxAsOf}
              stale={fxStale}
              onRefresh={refreshFxRates}
              onRateChange={setFxRate}
            />

            {hasAutoFilledServices && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm">
                  Some services below were filled in automatically from the enquiry. Check the dates,
                  suites and rates — they are recorded as reviewed when you apply this to the quote.
                </p>
              </div>
            )}

            {!hasAutoFilledServices && confirmedStamp && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5" />
                Services confirmed
                {confirmedStamp.by ? ` by ${confirmedStamp.by}` : ""} on{" "}
                {formatDisplayDateTime(confirmedStamp.at)}
              </p>
            )}

            <div className="space-y-4">
              {sortedLegs.map((leg) => {
                const state = legStates.find((candidate) => candidate.legId === leg.id)
                if (!state) return null
                return (
                  <div key={leg.id} className="space-y-2">
                    {state.kind === "transport" ? (
                      <TransportLegEditor
                        leg={leg}
                        value={state}
                        onChange={updateLegState}
                        anchorContext={transferAnchorContext(leg.id)}
                        rateTypes={rateTypes}
                        quoteCurrency={quoteCurrency}
                        fxRates={fxRates}
                        travelDate={travelDate}
                        expectedTotals={totalsBySupplierId[leg.supplierId] ?? null}
                      />
                    ) : (
                      <SuiteLegEditor
                        leg={leg}
                        value={state}
                        onChange={updateLegState}
                        expectedTotals={totalsBySupplierId[leg.supplierId] ?? null}
                        anchorContext={hotelAnchorContext(leg.id)}
                        flightAnchorContext={transferAnchorContext(leg.id)}
                        primarySupplierId={savedState?.primarySupplierId ?? null}
                        rateTypes={rateTypes}
                        quoteCurrency={quoteCurrency}
                        fxRates={fxRates}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            <FxRateBanner
              foreignCurrencies={foreignCurrencies}
              quoteCurrency={quoteCurrency}
              rates={fxRates}
              asOf={fxAsOf}
              stale={fxStale}
              onRefresh={refreshFxRates}
              onRateChange={setFxRate}
            />

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

            {mismatchedSplitLegs.length > 0 && bookingCounts && (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                  <h3 className="text-sm font-semibold">Travellers</h3>
                </div>
                <div className="space-y-2">
                  {mismatchedSplitLegs.map(({ legId, label, supplierId, summed, unitNounPlural }) => {
                    const totals = totalsBySupplierId[supplierId]
                    const delta = totals ? resolveAdultsOnlyDelta(totals, summed) : null
                    const nextAdults = delta !== null ? bookingCounts.noOfAdults + delta : null
                    return (
                      <div key={legId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p>
                          {label}: {unitNounPlural} hold {summed.adultCount} adults, {summed.childCount} children,{" "}
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
                {/* Nothing is being replaced on a first build — the old title
                    contradicted the body copy right below it. */}
                {existingLineItemCount > 0 ? "Confirm replacement" : "Review quote lines"}
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

            {incompleteLegs.length > 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <TriangleAlert className="h-4 w-4 text-destructive" />
                  {incompleteLegs.length === 1 ? "One service is" : `${incompleteLegs.length} services are`}{" "}
                  not priced below
                </p>
                <ul className="mt-1 list-disc pl-6 text-xs text-muted-foreground">
                  {incompleteLegs.map((leg) => (
                    <li key={leg.legId}>{leg.message}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  Go back and finish configuring{" "}
                  {incompleteLegs.length === 1 ? "it" : "them"} — the quote cannot be saved while a
                  service is missing from it.
                </p>
              </div>
            )}

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
                          {li.pricingSnapshot?.pricingMode === "manual" && isMissingPricing(li) ? (
                            <Badge variant="destructive" className="ml-1.5 align-middle text-[9px]">
                              Fare required
                            </Badge>
                          ) : null}
                        </div>
                        {li.pricingSnapshot?.rateTypeName && (
                          <span className="text-[11px] text-muted-foreground">
                            {li.pricingSnapshot.rateTypeName}
                            {/* An explicitly chosen rate type now errors rather than substituting,
                                so this can only mean the leg had none and a default was used. */}
                            {li.pricingSnapshot.rateTypeInherited ? " (default)" : ""}
                          </span>
                        )}
                        <FxProvenanceNote snapshot={li.pricingSnapshot ?? null} />
                        <RoomOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={quoteCurrency} />
                        <TransportOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={quoteCurrency} />
                        <TourOverrideNote snapshot={li.pricingSnapshot ?? null} quoteCurrency={quoteCurrency} />
                        <CommissionBadge
                          commission={li.pricingSnapshot?.commission ?? null}
                          currency={quoteCurrency}
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        <div>{li.qty}</div>
                        {li.pricingSnapshot?.unit ? (
                          <div className="text-[11px] text-muted-foreground">{li.pricingSnapshot.unit}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">{formatMoney(li.unitPrice, quoteCurrency)}</td>
                      <td className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">{formatMoney(li.total, quoteCurrency)}</td>
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
                <Button
                  variant="outline"
                  onClick={() => applyToQuote({ ignoreExpectedUpdatedAt: true })}
                  disabled={applying || incompleteLegs.length > 0}
                >
                  Save anyway
                </Button>
              )}
              <Button onClick={() => applyToQuote()} disabled={applying || incompleteLegs.length > 0}>
                {applying ? "Applying…" : existingLineItemCount > 0 ? "Replace & apply" : "Apply to quote"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
