import type {
  BookingTransportRequest,
  HotelDateAnchor,
  PackageDetail,
  PackageLeg,
  SupplierKind,
} from "@/lib/types"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import { findAnchorTrainLeg, resolveHotelStayDates } from "@/lib/packages/hotel-dates"
import { dateOnly } from "@/lib/packages/trip-date-range"
import { findRateCardCandidates, hasAnyRateCardFor } from "@/lib/rate-cards/resolve"

/**
 * Pure state model for Build Booking's configure step (components/build-booking-dialog.tsx --
 * the only live consumer; the catalogue-package "apply package" dialog that once shared this is
 * dead code with zero importers).
 *
 * The dialog owns one ApplyLegState per booking_services row. On "Next" the state is converted
 * into the persistence payloads and the pricing payload:
 * - toPackageSelectionsPatch  → PATCH /api/jobs/[id]/services (field names kept identical to the
 *                                catalogue endpoint's shape on purpose -- see that route's doc
 *                                comment)
 * - toTransportRequestsPut    → PUT  /api/jobs/[id]/transport-requests
 * - toApplySelections         → POST /api/jobs/[id]/services/apply
 */

export const TRANSPORT_SUPPLIER_KINDS = new Set<SupplierKind>(["transfers", "vehicle_rental"])
export const PASSENGER_SPLIT_SUPPLIER_KINDS = new Set<SupplierKind>([
  "train_operator",
  "tour_operator",
  "airline",
])

export interface SuiteUnitState {
  /** Persisted unit uuid, or a `draft-` key for units added in the dialog. */
  id: string
  suiteTypeId: string | null
  bedroomTypeId: string | null
  bedroomLayoutId: string | null
  bathroomTypeId: string | null
  adultCount: number
  childCount: number
  infantCount: number
}

export interface SuiteLegState {
  kind: "suite"
  legId: string
  supplierKind: SupplierKind
  selected: boolean
  routeId: string | null
  /** Two-way (round_trip) routes only: when true the booking travels destination → origin. */
  reversed: boolean
  serviceDate: string | null
  /** Hotel legs only. */
  nights: number | null
  /** Hotel legs only: `pre`/`post` derive serviceDate from the train leg, `custom` leaves it manual. */
  dateAnchor: HotelDateAnchor | null
  notes: string | null
  /** Per-leg rate type; null falls back to the system default at pricing time. */
  rateTypeId: string | null
  units: SuiteUnitState[]
  /** 'auto' drives the "Auto-filled" chip — cleared (by the caller, in updateLegState) the
   *  moment any field on this leg is edited, mirroring FieldFlags' dirty-suppresses-badge rule. */
  origin: "auto" | "consultant"
}

export interface TransportLegState {
  kind: "transport"
  legId: string
  supplierKind: SupplierKind
  selected: boolean
  routeId: string | null
  /** Per-leg rate type; null falls back to the system default at pricing time. */
  rateTypeId: string | null
  requests: BookingTransportRequest[]
  origin: "auto" | "consultant"
}

export type ApplyLegState = SuiteLegState | TransportLegState

/** Saved selection rows as returned by GET/POST /api/jobs/[id]/package (snake_case). */
export interface SavedSelectionUnitRow {
  id: string
  suite_type_id: string | null
  bedroom_type_id: string | null
  bedroom_layout_id: string | null
  bathroom_type_id: string | null
  adult_count: number
  child_count: number
  infant_count: number
  sort_order: number
}

export interface SavedSelectionRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  route_reversed: boolean | null
  suite_type_id: string | null
  service_date: string | null
  nights: number | null
  date_anchor: string | null
  rate_type_id: string | null
  notes: string | null
  units: SavedSelectionUnitRow[]
  /** Absent for a catalogue selection row (which has no such concept); present for a
   *  booking_services row. Missing/undefined is treated as 'consultant' -- never surface a chip
   *  on data this old. */
  origin?: "auto" | "consultant"
}

export interface SavedPackageState {
  packageId: string | null
  tripStartDate: string | null
  tripEndDate: string | null
  selections: SavedSelectionRow[]
}

let draftCounter = 0

export function createDraftUnit(totals?: PassengerTotals): SuiteUnitState {
  draftCounter += 1
  return {
    id: `draft-${draftCounter}`,
    suiteTypeId: null,
    bedroomTypeId: null,
    bedroomLayoutId: null,
    bathroomTypeId: null,
    adultCount: totals?.adultCount ?? 0,
    childCount: totals?.childCount ?? 0,
    infantCount: totals?.infantCount ?? 0,
  }
}

export function createDraftTransportRequest(leg: PackageLeg, routeId?: string | null): BookingTransportRequest {
  const now = new Date().toISOString()
  const isRental = leg.supplierKind === "vehicle_rental"
  const route = leg.routes.find((candidate) => candidate.id === (routeId ?? defaultRouteId(leg))) ?? null
  return {
    id: crypto.randomUUID(),
    bookingId: "",
    serviceType: isRental ? "rental" : "transfer",
    supplierId: leg.supplierId,
    routeId: null,
    suiteTypeId: null,
    // apply-dialog-state.ts is Build Booking's state model exclusively (the catalogue "apply
    // package" dialog that once shared it is dead code) -- leg.id here is always a
    // booking_services.id, so it belongs in serviceId, not packageLegId.
    packageLegId: null,
    serviceId: leg.id,
    pickupPoint: route?.pickupPoint ?? "",
    dropoffPoint: route?.dropoffPoint ?? "",
    pickupAt: null,
    rentalDetails: isRental
      ? { transportRequestId: "", returnAt: null, returnCutoffTime: null, createdAt: now, updatedAt: now }
      : null,
    passengerCount: null,
    luggageCount: null,
    flightNumber: null,
    priceOverride: null,
    notes: null,
    supplierReference: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function sortedLegs(detail: PackageDetail): PackageLeg[] {
  return detail.legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
}

function defaultRouteId(leg: PackageLeg): string | null {
  return leg.routes.length === 1 ? leg.routes[0].id : null
}

/** Only two-way (round_trip) routes can be flipped; one-way (and unresolved) routes cannot. */
export function isRouteReversible(leg: PackageLeg | undefined, routeId: string | null): boolean {
  if (!leg || !routeId) return false
  return leg.routes.find((route) => route.id === routeId)?.directionMode === "round_trip"
}

export interface BuildDefaultLegStatesOptions {
  tripStartDate: string | null
  /** Booking-level totals per supplier — seeds the first unit's passenger split on split legs. */
  totalsBySupplierId?: Record<string, PassengerTotals>
  /** Seeds every leg's rate type (customer default falling back to system default). */
  defaultRateTypeId?: string | null
}

export function buildDefaultLegStates(
  detail: PackageDetail,
  options: BuildDefaultLegStatesOptions,
): ApplyLegState[] {
  return applyAnchoredHotelDates(detail, buildRawDefaultLegStates(detail, options))
}

function buildRawDefaultLegStates(
  detail: PackageDetail,
  options: BuildDefaultLegStatesOptions,
): ApplyLegState[] {
  return sortedLegs(detail).map((leg) => {
    if (TRANSPORT_SUPPLIER_KINDS.has(leg.supplierKind)) {
      return {
        kind: "transport",
        legId: leg.id,
        supplierKind: leg.supplierKind,
        selected: leg.supplierKind === "train_operator",
        routeId: defaultRouteId(leg),
        rateTypeId: options.defaultRateTypeId ?? null,
        requests: [createDraftTransportRequest(leg)],
        origin: "consultant",
      } satisfies TransportLegState
    }

    const totals = PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)
      ? options.totalsBySupplierId?.[leg.supplierId]
      : undefined

    const isHotel = leg.supplierKind === "hotel_property"

    return {
      kind: "suite",
      legId: leg.id,
      supplierKind: leg.supplierKind,
      selected: leg.supplierKind === "train_operator",
      routeId: defaultRouteId(leg),
      reversed: false,
      serviceDate: options.tripStartDate,
      nights: isHotel ? 1 : null,
      // An un-anchored hotel keeps today's behaviour: a manually picked service date.
      dateAnchor: isHotel ? leg.dateAnchor ?? "custom" : null,
      notes: null,
      rateTypeId: options.defaultRateTypeId ?? null,
      units: [createDraftUnit(totals)],
      origin: "consultant",
    } satisfies SuiteLegState
  })
}

function normalizeSavedAnchor(value: string | null): HotelDateAnchor | null {
  return value === "pre" || value === "post" || value === "custom" ? value : null
}

/** The train leg a hotel leg's dates hang off, plus the departure date and route length currently
 * chosen on it. Returns null for legs that aren't anchored hotels or have no train to anchor to. */
export function getHotelAnchorContext(
  detail: PackageDetail,
  states: ApplyLegState[],
  hotelLegId: string,
): { trainLeg: PackageLeg; departureDate: string | null; durationDays: number | null } | null {
  const state = states.find((candidate) => candidate.legId === hotelLegId)
  if (state?.kind !== "suite" || state.supplierKind !== "hotel_property") return null

  const trainLeg = findAnchorTrainLeg(detail.legs, hotelLegId, state.dateAnchor)
  if (!trainLeg) return null

  const trainState = states.find((candidate) => candidate.legId === trainLeg.id)
  const routeId = trainState?.routeId ?? null
  const route =
    trainLeg.routes.find((candidate) => candidate.id === routeId) ??
    (trainLeg.routes.length === 1 ? trainLeg.routes[0] : undefined)

  return {
    trainLeg,
    departureDate: trainState?.kind === "suite" ? trainState.serviceDate : null,
    durationDays: route?.durationDays ?? null,
  }
}

/** The train leg this hotel's dates hang off, as the leg editor needs it. */
export interface HotelAnchorContext {
  trainLabel: string
  departureDate: string | null
  durationDays: number | null
}

/** View-model form of {@link getHotelAnchorContext} — what the suite leg editor takes as a prop. */
export function toHotelAnchorContext(
  detail: PackageDetail,
  states: ApplyLegState[],
  hotelLegId: string,
): HotelAnchorContext | null {
  const context = getHotelAnchorContext(detail, states, hotelLegId)
  if (!context) return null

  return {
    trainLabel: context.trainLeg.label ?? context.trainLeg.supplierName,
    departureDate: context.departureDate,
    durationDays: context.durationDays,
  }
}

/** Recomputes the service date of every pre/post-anchored hotel leg from its train leg. Runs after
 * any state change so editing the train's departure date or a hotel's nights re-dates the stay. */
export function applyAnchoredHotelDates(
  detail: PackageDetail,
  states: ApplyLegState[],
): ApplyLegState[] {
  return states.map((state) => {
    if (state.kind !== "suite" || state.supplierKind !== "hotel_property") return state
    if (state.dateAnchor !== "pre" && state.dateAnchor !== "post") return state

    const context = getHotelAnchorContext(detail, states, state.legId)
    const dates = resolveHotelStayDates(state.dateAnchor, state.nights ?? 1, context)
    if (!dates || dates.checkIn === state.serviceDate) return state

    return { ...state, serviceDate: dates.checkIn }
  })
}

/** Hydrates dialog state from the booking's saved selections and transport requests. Legs with
 * no saved row (shouldn't happen after package assign seeds them, but defensive) get defaults. */
export function hydrateFromSaved(
  detail: PackageDetail,
  saved: SavedPackageState,
  transportRequests: BookingTransportRequest[],
  options: BuildDefaultLegStatesOptions,
): ApplyLegState[] {
  const selectionByLegId = new Map(saved.selections.map((row) => [row.package_leg_id, row]))
  const legById = new Map(detail.legs.map((leg) => [leg.id, leg]))
  const defaults = buildRawDefaultLegStates(detail, options)

  const hydrated = defaults.map((fallback) => {
    const row = selectionByLegId.get(fallback.legId)

    if (fallback.kind === "transport") {
      const legRequests = transportRequests
        .filter((request) => request.serviceId === fallback.legId || request.packageLegId === fallback.legId)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
      return {
        ...fallback,
        selected: row?.selected ?? fallback.selected,
        routeId: row?.route_id ?? fallback.routeId,
        rateTypeId: row?.rate_type_id ?? fallback.rateTypeId,
        requests: legRequests.length > 0 ? legRequests : fallback.requests,
        origin: row?.origin ?? fallback.origin,
      } satisfies TransportLegState
    }

    if (!row) return fallback

    const units: SuiteUnitState[] = row.units
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((unit) => ({
        id: unit.id,
        suiteTypeId: unit.suite_type_id,
        bedroomTypeId: unit.bedroom_type_id,
        bedroomLayoutId: unit.bedroom_layout_id,
        bathroomTypeId: unit.bathroom_type_id,
        adultCount: unit.adult_count,
        childCount: unit.child_count,
        infantCount: unit.infant_count,
      }))

    const isHotel = fallback.supplierKind === "hotel_property"
    const routeId = row.route_id ?? fallback.routeId

    return {
      ...fallback,
      selected: row.selected,
      routeId,
      reversed: isRouteReversible(legById.get(fallback.legId), routeId)
        ? row.route_reversed ?? false
        : false,
      serviceDate: row.service_date ?? fallback.serviceDate,
      nights: isHotel ? row.nights ?? fallback.nights : null,
      // No saved anchor (pre-existing booking, or seeded by intake) falls back to the package's.
      dateAnchor: isHotel ? normalizeSavedAnchor(row.date_anchor) ?? fallback.dateAnchor : null,
      notes: row.notes,
      rateTypeId: row.rate_type_id ?? fallback.rateTypeId,
      units: units.length > 0 ? units : fallback.units,
      origin: row.origin ?? fallback.origin,
    } satisfies SuiteLegState
  })

  return applyAnchoredHotelDates(detail, hydrated)
}

/** PATCH /api/jobs/[id]/package-selections body. */
export interface PackageSelectionsPatchBody {
  selections: Array<{
    packageLegId: string
    selected: boolean
    routeId: string | null
    routeReversed?: boolean
    serviceDate?: string | null
    nights?: number | null
    dateAnchor?: HotelDateAnchor | null
    rateTypeId?: string | null
    notes?: string | null
    units?: Array<{
      id?: string
      suiteTypeId: string | null
      bedroomTypeId: string | null
      bedroomLayoutId: string | null
      bathroomTypeId: string | null
      adultCount: number
      childCount: number
      infantCount: number
      sortOrder: number
    }>
  }>
}

export function toPackageSelectionsPatch(states: ApplyLegState[]): PackageSelectionsPatchBody {
  return {
    selections: states.map((state) => {
      if (state.kind === "transport") {
        return {
          packageLegId: state.legId,
          selected: state.selected,
          routeId: state.routeId,
          rateTypeId: state.rateTypeId,
        }
      }
      return {
        packageLegId: state.legId,
        selected: state.selected,
        routeId: state.routeId,
        routeReversed: state.reversed,
        serviceDate: state.serviceDate,
        nights: state.supplierKind === "hotel_property" ? Math.max(1, state.nights ?? 1) : null,
        dateAnchor: state.supplierKind === "hotel_property" ? state.dateAnchor : null,
        rateTypeId: state.rateTypeId,
        notes: state.notes,
        units: state.units.map((unit, index) => ({
          id: unit.id.startsWith("draft-") ? undefined : unit.id,
          suiteTypeId: unit.suiteTypeId,
          bedroomTypeId: unit.bedroomTypeId,
          bedroomLayoutId: unit.bedroomLayoutId,
          bathroomTypeId: unit.bathroomTypeId,
          adultCount: unit.adultCount,
          childCount: unit.childCount,
          infantCount: unit.infantCount,
          sortOrder: index,
        })),
      }
    }),
  }
}

/** PUT /api/jobs/[id]/transport-requests body. */
export interface TransportRequestsPutBody {
  transportRequests: Array<{
    id: string
    serviceType: "transfer" | "rental"
    supplierId: string | null
    routeId: string | null
    suiteTypeId: string | null
    packageLegId: string | null
    serviceId: string | null
    pickupPoint: string
    dropoffPoint: string
    pickupAt: string | null
    rentalDetails: { returnAt: string | null; returnCutoffTime: string | null } | null
    passengerCount: number | null
    luggageCount: number | null
    flightNumber: string | null
    priceOverride: number | null
    notes: string | null
    sortOrder: number
  }>
}

/** Builds the replace-set for transport requests: dialog-managed rows for this package's *selected*
 * transport legs, plus manually-added rows (`packageLegId === null`). Rows tied to legs of a
 * previously assigned package, and rows for legs the user deselected, are intentionally dropped —
 * re-sending them here would resurrect stale rows or send blank draft fields. */
export function toTransportRequestsPut(
  states: ApplyLegState[],
  existing: BookingTransportRequest[],
): TransportRequestsPutBody {
  const untouched = existing.filter((request) => !request.packageLegId && !request.serviceId)
  const managed = states.flatMap((state) =>
    state.kind === "transport" && state.selected ? state.requests : [],
  )

  return {
    transportRequests: [...untouched, ...managed].map((request, index) => ({
      id: request.id,
      serviceType: request.serviceType,
      supplierId: request.supplierId,
      routeId: request.routeId,
      suiteTypeId: request.suiteTypeId,
      packageLegId: request.packageLegId,
      serviceId: request.serviceId,
      pickupPoint: request.pickupPoint,
      dropoffPoint: request.dropoffPoint,
      pickupAt: request.pickupAt,
      rentalDetails:
        request.serviceType === "rental"
          ? {
              returnAt: request.rentalDetails?.returnAt ?? null,
              returnCutoffTime: request.rentalDetails?.returnCutoffTime ?? null,
            }
          : null,
      passengerCount: request.passengerCount,
      luggageCount: request.luggageCount,
      flightNumber: request.flightNumber,
      priceOverride: request.priceOverride,
      notes: request.notes,
      sortOrder: index,
    })),
  }
}

export interface ApplyCommissionOverride {
  type: "percent" | "per_person"
  value: number
}

/** POST /api/packages/[slug]/apply `selections` entries. */
export interface ApplyLegSelectionPayload {
  legId: string
  selected: boolean
  routeId?: string
  routeReversed?: boolean
  /** The leg's own service date — pricing matches rate cards against it. */
  serviceDate?: string | null
  suiteTypeId?: string
  units?: Array<{
    suiteTypeId: string
    bedroomTypeId: string | null
    bedroomLayoutId: string | null
    bathroomTypeId: string | null
    adultCount: number
    childCount: number
    infantCount: number
  }>
  nights?: number
  /** Per-leg rate type override; omitted falls back to the system default. */
  rateTypeId?: string
  commissionOverride?: ApplyCommissionOverride | null
}

export function toApplySelections(
  states: ApplyLegState[],
  commissionOverridesByLegId: Record<string, ApplyCommissionOverride | null | undefined> = {},
): ApplyLegSelectionPayload[] {
  return states.map((state) => {
    const commissionOverride = commissionOverridesByLegId[state.legId] ?? undefined

    if (state.kind === "transport") {
      // Pricing is per transport-request row; the leg-level vehicle category is the fallback
      // for rows that don't set their own.
      const fallbackSuiteTypeId = state.requests.find((request) => request.suiteTypeId)?.suiteTypeId
      return {
        legId: state.legId,
        selected: state.selected,
        routeId: state.routeId ?? undefined,
        suiteTypeId: fallbackSuiteTypeId ?? undefined,
        rateTypeId: state.rateTypeId ?? undefined,
        commissionOverride,
      }
    }

    return {
      legId: state.legId,
      selected: state.selected,
      routeId: state.routeId ?? undefined,
      routeReversed: state.reversed,
      serviceDate: state.serviceDate ?? undefined,
      units: state.units
        .filter((unit): unit is SuiteUnitState & { suiteTypeId: string } => Boolean(unit.suiteTypeId))
        .map((unit) => ({
          suiteTypeId: unit.suiteTypeId,
          bedroomTypeId: unit.bedroomTypeId,
          bedroomLayoutId: unit.bedroomLayoutId,
          bathroomTypeId: unit.bathroomTypeId,
          adultCount: unit.adultCount,
          childCount: unit.childCount,
          infantCount: unit.infantCount,
        })),
      nights:
        state.supplierKind === "hotel_property" ? Math.max(1, state.nights ?? 1) : undefined,
      rateTypeId: state.rateTypeId ?? undefined,
      commissionOverride,
    }
  })
}

export interface ValidateConfigureStateOptions {
  totalsBySupplierId?: Record<string, PassengerTotals>
}

/** Distinguishes "this route+type was never priced" from "priced, but not on this date" —
 * mirrors the two-case error thrown at build time in lib/quotes/build-from-package.ts. */
function describeMissingRateCard(
  leg: PackageLeg,
  routeId: string,
  suiteTypeId: string,
  pricingDate: string,
): string | null {
  if (findRateCardCandidates(leg.rateCards, routeId, suiteTypeId, pricingDate).length > 0) return null
  const suiteTypeName = leg.suiteTypes.find((s) => s.id === suiteTypeId)?.name ?? "this type"
  const routeName = leg.routes.find((r) => r.id === routeId)?.name ?? "this route"
  const where = `"${suiteTypeName}" on "${routeName}"`
  return hasAnyRateCardFor(leg.rateCards, routeId, suiteTypeId)
    ? `no rate card covers ${pricingDate} for ${where} — extend the validity period or add a new one`
    : `no rate card for ${where} — add one under Suppliers → ${leg.supplierName}`
}

/** Mirrors the server-side rules so the user sees actionable errors before the Next sequence.
 * Returns human-readable problems; empty array means the state is ready to persist and price. */
export function validateConfigureState(
  detail: PackageDetail,
  states: ApplyLegState[],
  options: ValidateConfigureStateOptions = {},
): string[] {
  const errors: string[] = []
  const legById = new Map(detail.legs.map((leg) => [leg.id, leg]))

  for (const state of states) {
    if (!state.selected) continue
    const leg = legById.get(state.legId)
    if (!leg) continue
    const legLabel = leg.label ?? leg.supplierName

    // Transport legs don't require a route: preset routes are only quick-fill templates for the
    // pickup/drop-off fields, and pricing comes from the vehicle-category rate card.
    if (state.kind !== "transport") {
      if (leg.routes.length === 0) {
        errors.push(`${legLabel}: no ${leg.supplierKind === "hotel_property" ? "meal plans" : "routes"} configured for this supplier — add one in Suppliers first`)
      } else if (leg.routes.length > 1 && !state.routeId) {
        errors.push(`${legLabel}: select a ${leg.supplierKind === "hotel_property" ? "meal plan" : "route"}`)
      }
    }

    if (state.kind === "transport") {
      if (leg.suiteTypes.length === 0) {
        errors.push(`${legLabel}: no vehicle categories configured for this supplier — add one in Suppliers first`)
      }
      state.requests.forEach((request, index) => {
        const label = state.requests.length > 1 ? `${legLabel} #${index + 1}` : legLabel
        if (!request.pickupPoint.trim()) errors.push(`${label}: pickup point is required`)
        if (!request.dropoffPoint.trim()) errors.push(`${label}: drop-off point is required`)
        if (request.serviceType === "rental" && !request.rentalDetails?.returnAt) {
          errors.push(`${label}: return date/time is required`)
        }
        if (leg.suiteTypes.length > 0 && !request.suiteTypeId) {
          errors.push(`${label}: select a vehicle category`)
        }
        // Route + type resolved: check pricing exists before the salesperson hits Next and gets
        // a build-time error that's harder to connect back to this row.
        const pricingDate = dateOnly(request.pickupAt)
        if (request.routeId && request.suiteTypeId && pricingDate) {
          const pricingError = describeMissingRateCard(
            leg,
            request.routeId,
            request.suiteTypeId,
            pricingDate,
          )
          if (pricingError) errors.push(`${label}: ${pricingError}`)
        }
      })
      continue
    }

    if (state.units.length === 0) {
      errors.push(`${legLabel}: add at least one ${leg.supplierKind === "hotel_property" ? "room" : "suite"}`)
    }
    state.units.forEach((unit, index) => {
      if (!unit.suiteTypeId) {
        errors.push(
          `${legLabel}: ${leg.supplierKind === "hotel_property" ? "room" : "suite"} ${index + 1} needs a type`,
        )
      } else if (state.routeId && state.serviceDate) {
        const pricingError = describeMissingRateCard(leg, state.routeId, unit.suiteTypeId, state.serviceDate)
        if (pricingError) errors.push(`${legLabel}: ${pricingError}`)
      }
    })

    if (state.supplierKind === "hotel_property" && (state.nights ?? 0) < 1) {
      errors.push(`${legLabel}: nights must be at least 1`)
    }

    // Trip dates are derived from the services, so every selected suite leg needs its date.
    // For an anchored hotel a missing date means the train leg it hangs off has no departure
    // date yet (or the package has no train leg at all) — the salesperson sets it themselves.
    if (!state.serviceDate) {
      errors.push(
        `${legLabel}: ${state.supplierKind === "hotel_property" ? "check-in" : "service"} date is required`,
      )
    }

    if (PASSENGER_SPLIT_SUPPLIER_KINDS.has(state.supplierKind)) {
      const totals = options.totalsBySupplierId?.[leg.supplierId]
      if (totals) {
        const summed = state.units.reduce(
          (acc, unit) => ({
            adultCount: acc.adultCount + unit.adultCount,
            childCount: acc.childCount + unit.childCount,
            infantCount: acc.infantCount + unit.infantCount,
          }),
          { adultCount: 0, childCount: 0, infantCount: 0 },
        )
        if (
          summed.adultCount !== totals.adultCount ||
          summed.childCount !== totals.childCount ||
          summed.infantCount !== totals.infantCount
        ) {
          errors.push(
            `${legLabel}: passenger split (${summed.adultCount} adults, ${summed.childCount} children, ${summed.infantCount} infants) must sum to the booking's totals (${totals.adultCount} adults, ${totals.childCount} children, ${totals.infantCount} infants)`,
          )
        }
      }
    }
  }

  return errors
}
