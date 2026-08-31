import type {
  BookingTransportRequest,
  CommissionKind,
  PackageDetail,
  PackageLeg,
  ServiceDateAnchor,
  SupplierKind,
} from "@/lib/types"
import { isTypePricedSupplier, SUPPLIER_VOCABULARY } from "@/lib/types"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import type { AnchoredStay, HotelStayDates } from "@/lib/packages/hotel-dates"
import { findAnchorTrainLeg, resolveChainedHotelStayDates } from "@/lib/packages/hotel-dates"
import type { AnchorLegDates } from "@/lib/packages/transfer-dates"
import { findTransferAnchorLeg, resolveTransferPickupDate } from "@/lib/packages/transfer-dates"
import type { ServiceDateSpan } from "@/lib/packages/trip-date-range"
import { dateOnly, selectedRouteDurationDays, serviceDateSpan } from "@/lib/packages/trip-date-range"
import { splitLocalDateTime, joinLocalDateTime } from "@/lib/date-time-field"
import { toHoursMinutes } from "@/lib/routes/route-schedule"
import { resolveDirectedEndpointCodes } from "@/lib/routes/route-name"
import { BASE_CURRENCY } from "@/lib/money"
import {
  findRateCardCandidates,
  hasAnyRateCardFor,
  hasAnyRateCardForRateType,
} from "@/lib/rate-cards/resolve"
import { resolveTransferPricingBasis } from "@/lib/pricing/transfer-basis"

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
/** Kinds whose units show their own per-unit Adults/Children/Infants inputs. */
export const PASSENGER_SPLIT_SUPPLIER_KINDS = new Set<SupplierKind>([
  "train_operator",
  "tour_operator",
  "airline",
])
/** Kinds where the per-unit counts must sum to the booking's traveller totals -- each unit is a
 * sleeping/seating slot, so every traveller has to land in exactly one of them. A tour operator's
 * units are independent activities the same travellers can all join, so it's excluded here even
 * though it still shows the per-unit inputs (PASSENGER_SPLIT_SUPPLIER_KINDS above). */
export const PASSENGER_SUM_SUPPLIER_KINDS = new Set<SupplierKind>(["train_operator", "airline"])

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
  /** Manual-pricing legs only (leg.pricingMode === "manual", e.g. airlines): the typed fare for
   *  this unit's cabin. Ignored on rate-card legs. null child/infant falls back to adult. */
  manualAdultPrice: number | null
  manualChildPrice: number | null
  manualInfantPrice: number | null
  /** Hotel legs only: a consultant-typed price per room per night that replaces the rate card for
   *  this room on this booking. Null leaves the room priced off its card. Booking-scoped and
   *  one-shot — it is never read back as a rate for a later booking. */
  manualRoomPrice: number | null
  /** Read-only provenance for the override, stamped server-side. Never sent back on save. */
  manualRoomPriceSetAt?: string | null
  /** Hotel legs only: the hotel gifted this room's first night, so the quote charges nights - 1
   *  at the room's per-night price (its rate card's, or manualRoomPrice when one was typed). */
  complimentaryFirstNight: boolean
  /** Tour legs only: a consultant-typed flat price that replaces this unit's rate-card-computed
   *  total. Null leaves the unit priced off its card. Booking-scoped and one-shot, same posture
   *  as manualRoomPrice. */
  manualTourPrice: number | null
  /** Read-only provenance for the override, stamped server-side. Never sent back on save. */
  manualTourPriceSetAt?: string | null
  /** Tour legs only: this unit's own rate type, overriding the leg's rateTypeId. Every other kind
   *  keeps one rate type per leg -- see SuiteLegState.rateTypeId -- since a tour is the one kind
   *  whose units price independently of each other. Null falls back to the leg's rate type. */
  rateTypeId: string | null
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
  /** Airline legs only — the flight this booking is actually on. `serviceDate` is its departure
   *  date; `arrivalDate` is a full date so an overnight flight states a real arrival day. */
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  flightNumber: string | null
  departureAirportCode: string | null
  arrivalAirportCode: string | null
  handLuggageKg: number | null
  checkedLuggageKg: number | null
  /** Hotel and airline legs only. Hotel: `pre`/`post` derive serviceDate from the train leg.
   *  Airline: `pre`/`post` derive serviceDate (departure) from the leg above it, same as a
   *  transfer's pickup date. `custom` leaves it manual either way. */
  dateAnchor: ServiceDateAnchor | null
  notes: string | null
  /** Hotel legs only: the property lets guests store luggage at reception, printed as a suffix on
   *  the quote itinerary's check-out line. */
  luggageStorageAvailable: boolean
  /** Explicit per-leg rate type; null inherits the supplier's quoted rate at pricing time. */
  rateTypeId: string | null
  /** The currency this leg's hand-typed fares are in (manual-pricing legs only). Rate-card legs
   *  ignore it and price off the card's own currency. */
  priceCurrency: string
  units: SuiteUnitState[]
  /** Internal supplier-booking record — when this leg was placed, confirmed and paid with the
   *  supplier. Never shown to the customer; feeds the booking worksheet. */
  bookingDate: string | null
  confirmationDate: string | null
  paymentMadeDate: string | null
  paidWith: string | null
  /** 'auto' drives the "Auto-filled" chip — cleared (by the caller, in updateLegState) the
   *  moment any field on this leg is edited, mirroring FieldFlags' dirty-suppresses-badge rule. */
  origin: "auto" | "consultant"
  /** The row version this state was hydrated from; echoed back so a concurrent save 409s instead
   *  of being silently overwritten. Null for a leg that has never been saved. */
  updatedAt?: string | null
}

export interface TransportLegState {
  kind: "transport"
  legId: string
  supplierKind: SupplierKind
  selected: boolean
  routeId: string | null
  /** Explicit per-leg rate type; null inherits the supplier's quoted rate at pricing time. */
  rateTypeId: string | null
  /** The currency a request's priceOverride is typed in. Requests with no override price off
   *  the rate card and ignore it. */
  priceCurrency: string
  requests: BookingTransportRequest[]
  /** See SuiteLegState.bookingDate/confirmationDate/paymentMadeDate/paidWith — the supplier
   *  booking record for the transfer/rental supplier itself, not any one trip. */
  bookingDate: string | null
  confirmationDate: string | null
  paymentMadeDate: string | null
  paidWith: string | null
  origin: "auto" | "consultant"
  /** See SuiteLegState.updatedAt. */
  updatedAt?: string | null
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
  manual_adult_price?: number | null
  manual_child_price?: number | null
  manual_infant_price?: number | null
  manual_room_price?: number | null
  manual_room_price_set_at?: string | null
  complimentary_first_night?: boolean | null
  manual_tour_price?: number | null
  manual_tour_price_set_at?: string | null
  rate_type_id?: string | null
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
  /** Airline legs only, and absent on a catalogue selection row. */
  departure_time?: string | null
  arrival_date?: string | null
  arrival_time?: string | null
  flight_number?: string | null
  departure_airport_code?: string | null
  arrival_airport_code?: string | null
  hand_luggage_kg?: number | null
  checked_luggage_kg?: number | null
  /** Absent on a catalogue selection row; present on a booking_services row. */
  price_currency?: string | null
  /** Hotel legs only; absent on a catalogue selection row. */
  luggage_storage_available?: boolean | null
  /** Absent on a catalogue selection row; present on a booking_services row. */
  booking_date?: string | null
  confirmation_date?: string | null
  payment_made_date?: string | null
  paid_with?: string | null
  units: SavedSelectionUnitRow[]
  /** Absent for a catalogue selection row (which has no such concept); present for a
   *  booking_services row. Missing/undefined is treated as 'consultant' -- never surface a chip
   *  on data this old. */
  origin?: "auto" | "consultant"
  /** booking_services.updated_at, echoed back on the next PATCH as the optimistic-lock token.
   *  Absent for catalogue selection rows, which have no such column. */
  updated_at?: string | null
  /** Set by GET /api/jobs/[id]/services only, so Build Booking's step 1 can render its service
   *  list off that read instead of blocking on the much larger GET /build-booking payload.
   *  Absent on catalogue selection rows and on the PATCH reload response. */
  sort_order?: number
  supplier_name?: string | null
  supplier_kind?: string | null
}

export interface SavedPackageState {
  packageId: string | null
  tripStartDate: string | null
  tripEndDate: string | null
  selections: SavedSelectionRow[]
  /** Absent for a catalogue selection; set on a booking whose service list was explicitly
   *  confirmed (POST /api/jobs/[id]/services/confirm). */
  servicesConfirmedAt?: string | null
  servicesConfirmedByName?: string | null
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
    manualAdultPrice: null,
    manualChildPrice: null,
    manualInfantPrice: null,
    manualRoomPrice: null,
    manualRoomPriceSetAt: null,
    complimentaryFirstNight: false,
    manualTourPrice: null,
    manualTourPriceSetAt: null,
    rateTypeId: null,
  }
}

export function createDraftTransportRequest(
  leg: PackageLeg,
  routeId?: string | null,
  totals?: PassengerTotals,
): BookingTransportRequest {
  const now = new Date().toISOString()
  const isRental = leg.supplierKind === "vehicle_rental"
  const serviceType = isRental ? "rental" : "transfer"
  const route = leg.routes.find((candidate) => candidate.id === (routeId ?? defaultRouteId(leg))) ?? null
  // A brand-new row has no basis of its own yet, so it takes the supplier's current default --
  // the same fallback the DB's insert trigger would apply. See lib/pricing/transfer-basis.ts.
  const pricingBasis = resolveTransferPricingBasis({
    serviceType,
    rowBasis: null,
    supplierBasis: leg.transferPricingBasis,
  })
  const isPerPerson = pricingBasis === "per_person"
  return {
    id: crypto.randomUUID(),
    bookingId: "",
    serviceType,
    supplierId: leg.supplierId,
    routeId: null,
    suiteTypeId: null,
    // leg.id here is always a booking_services.id, so it belongs in serviceId.
    serviceId: leg.id,
    pickupPoint: route?.pickupPoint ?? "",
    dropoffPoint: route?.dropoffPoint ?? "",
    pickupAt: null,
    // A rental has no single leg above it to anchor two dates to (pickup and return); a fresh
    // transfer row starts unanchored too, same as a fresh hotel leg starts on a manual date.
    dateAnchor: "custom",
    rentalDetails: isRental
      ? { transportRequestId: "", returnAt: null, returnCutoffTime: null, createdAt: now, updatedAt: now }
      : null,
    passengerCount: null,
    luggageCount: null,
    flightNumber: null,
    priceOverride: null,
    priceOverrideSetAt: null,
    complimentary: false,
    notes: null,
    supplierReference: null,
    pricingBasis,
    // Prefilled from the booking's projected totals so a blank field reads as "using the
    // booking's totals" rather than zero -- the consultant can still edit any of the three.
    adultCount: isPerPerson ? totals?.adultCount ?? null : null,
    childCount: isPerPerson ? totals?.childCount ?? null : null,
    infantCount: isPerPerson ? totals?.infantCount ?? null : null,
    priceOverrideChild: null,
    priceOverrideInfant: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function sortedLegs(detail: PackageDetail): PackageLeg[] {
  return detail.legs.slice().sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * A tour operator's itinerary belongs to exactly one tour type, so "the leg's only itinerary"
 * is only a safe default when it actually matches a chosen tour type — never blindly grab it
 * just because it's the only one on the supplier (mirrors getRequiredRouteId in
 * lib/quotes/build-from-package.ts, the server-side counterpart of this guard). Every other
 * kind keeps the plain "only one route on the leg" default.
 */
function defaultRouteId(leg: PackageLeg, chosenSuiteTypeIds?: Set<string>): string | null {
  if (isTypePricedSupplier(leg.supplierKind)) {
    if (!chosenSuiteTypeIds || chosenSuiteTypeIds.size === 0) return null
    const matching = leg.routes.filter((route) => route.suiteTypeId && chosenSuiteTypeIds.has(route.suiteTypeId))
    return matching.length === 1 ? matching[0].id : null
  }
  return leg.routes.length === 1 ? leg.routes[0].id : null
}

/** True when a persisted routeId actually belongs to one of the chosen tour types — a stale or
 * mismatched saved value (e.g. left over from a removed tour, or an earlier bad default stamp)
 * must be re-derived rather than trusted just because it was saved. Non-type-priced kinds have
 * no such mismatch to guard against, so any saved value is trusted as-is. */
function isTrustedRouteId(
  leg: PackageLeg,
  routeId: string | null | undefined,
  chosenSuiteTypeIds: Set<string>,
): boolean {
  if (!isTypePricedSupplier(leg.supplierKind)) return true
  if (!routeId) return false
  const route = leg.routes.find((candidate) => candidate.id === routeId)
  return Boolean(route?.suiteTypeId && chosenSuiteTypeIds.has(route.suiteTypeId))
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
  /** The quote's currency, used as the default for a new leg's hand-typed prices. */
  quoteCurrency?: string
}

export function buildDefaultLegStates(
  detail: PackageDetail,
  options: BuildDefaultLegStatesOptions,
): ApplyLegState[] {
  return applyAnchoredDates(detail, buildRawDefaultLegStates(detail, options))
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
        rateTypeId: null,
        // A new leg types its prices in whatever the quote is denominated in; changing it is an
        // explicit act (the leg's currency dropdown), never a default.
        priceCurrency: options.quoteCurrency ?? BASE_CURRENCY,
        requests: [createDraftTransportRequest(leg, undefined, options.totalsBySupplierId?.[leg.supplierId])],
        bookingDate: null,
        confirmationDate: null,
        paymentMadeDate: null,
        paidWith: null,
        origin: "consultant",
      } satisfies TransportLegState
    }

    const totals = PASSENGER_SPLIT_SUPPLIER_KINDS.has(leg.supplierKind)
      ? options.totalsBySupplierId?.[leg.supplierId]
      : undefined

    const isHotel = leg.supplierKind === "hotel_property"
    const isAirline = leg.supplierKind === "airline"
    const routeId = defaultRouteId(leg)
    // Airport codes are the one part of a flight the system already knows, once a route is
    // resolved unambiguously (a single route on the leg) — its name is the code pair itself
    // (see lib/routes/route-name.ts). Everything else about the flight is still never guessed.
    const defaultEndpointCodes = isAirline
      ? resolveDirectedEndpointCodes(leg.routes.find((route) => route.id === routeId)?.name, false)
      : null

    return {
      kind: "suite",
      legId: leg.id,
      supplierKind: leg.supplierKind,
      selected: leg.supplierKind === "train_operator",
      routeId,
      reversed: false,
      serviceDate: options.tripStartDate,
      nights: isHotel ? 1 : null,
      // A flight's schedule is never guessed — a wrong time on a client document is worse than a
      // blank one, so every field stays empty until the consultant types the actual flight.
      departureTime: null,
      arrivalDate: null,
      arrivalTime: null,
      flightNumber: null,
      departureAirportCode: defaultEndpointCodes?.departure ?? null,
      arrivalAirportCode: defaultEndpointCodes?.arrival ?? null,
      handLuggageKg: null,
      checkedLuggageKg: null,
      // An un-anchored hotel/airline keeps today's behaviour: a manually picked service date.
      // Airline package legs never carry a template anchor, so this always falls back to "custom".
      dateAnchor: isHotel || isAirline ? leg.dateAnchor ?? "custom" : null,
      notes: null,
      luggageStorageAvailable: false,
      rateTypeId: null,
      priceCurrency: options.quoteCurrency ?? BASE_CURRENCY,
      units: [createDraftUnit(totals)],
      bookingDate: null,
      confirmationDate: null,
      paymentMadeDate: null,
      paidWith: null,
      origin: "consultant",
    } satisfies SuiteLegState
  })
}

function normalizeSavedAnchor(value: string | null): ServiceDateAnchor | null {
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
  /** This hotel's own resolved stay — chained with any other stay anchored to the same train on
   *  the same side, not just this hotel in isolation. Null while the anchor can't resolve yet
   *  (e.g. the train has no departure date). */
  stayDates: HotelStayDates | null
}

/** Every anchored hotel leg's chained stay dates in one pass, keyed by legId. Groups hotel states
 * by (anchor train, pre/post side) — a hotel between two trains resolves to a different train
 * depending on its own anchor, so the side is part of the grouping key, not just the train — and
 * runs {@link resolveChainedHotelStayDates} once per group so stays on the same side of the same
 * train are laid end to end instead of each landing on the train's date independently. Custom-
 * anchored legs never enter a group, so a hand-typed date is never moved and never shifts a
 * neighbour. */
function resolveAllAnchoredHotelDates(
  detail: PackageDetail,
  states: ApplyLegState[],
): Map<string, HotelStayDates> {
  interface Group {
    anchor: "pre" | "post"
    train: { departureDate: string | null; durationDays: number | null }
    stays: AnchoredStay[]
  }
  const groups = new Map<string, Group>()

  for (const state of states) {
    if (state.kind !== "suite" || state.supplierKind !== "hotel_property") continue
    if (state.dateAnchor !== "pre" && state.dateAnchor !== "post") continue

    const context = getHotelAnchorContext(detail, states, state.legId)
    if (!context) continue

    const leg = detail.legs.find((candidate) => candidate.id === state.legId)
    if (!leg) continue

    const key = `${context.trainLeg.id}:${state.dateAnchor}`
    const group =
      groups.get(key) ??
      ({
        anchor: state.dateAnchor,
        train: { departureDate: context.departureDate, durationDays: context.durationDays },
        stays: [],
      } satisfies Group)
    group.stays.push({ legId: state.legId, nights: state.nights ?? 1, sortOrder: leg.sortOrder })
    groups.set(key, group)
  }

  const resolved = new Map<string, HotelStayDates>()
  for (const group of groups.values()) {
    for (const [legId, dates] of resolveChainedHotelStayDates(group.stays, group.anchor, group.train)) {
      resolved.set(legId, dates)
    }
  }
  return resolved
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
    stayDates: resolveAllAnchoredHotelDates(detail, states).get(hotelLegId) ?? null,
  }
}

/** Recomputes the service date of every pre/post-anchored hotel leg from its train leg, chaining
 * consecutive same-side stays on one train end to end. Runs after any state change so editing the
 * train's departure date or any stay's nights re-dates the whole group. */
export function applyAnchoredHotelDates(
  detail: PackageDetail,
  states: ApplyLegState[],
): ApplyLegState[] {
  const resolved = resolveAllAnchoredHotelDates(detail, states)

  return states.map((state) => {
    if (state.kind !== "suite" || state.supplierKind !== "hotel_property") return state
    if (state.dateAnchor !== "pre" && state.dateAnchor !== "post") return state

    const dates = resolved.get(state.legId)
    if (!dates || dates.checkIn === state.serviceDate) return state

    return { ...state, serviceDate: dates.checkIn }
  })
}

/** The leg a transfer leg's pickup dates hang off — the nearest dated leg above it — plus that
 * leg's start/end dates as the transfer editor needs them. Null when the transfer opens the
 * itinerary or only other transport legs precede it. */
export function getTransferAnchorContext(
  detail: PackageDetail,
  states: ApplyLegState[],
  transferLegId: string,
): { anchorLeg: PackageLeg; span: ServiceDateSpan | null } | null {
  const anchorLeg = findTransferAnchorLeg(detail.legs, transferLegId)
  if (!anchorLeg) return null

  const anchorState = states.find((candidate) => candidate.legId === anchorLeg.id)
  if (anchorState?.kind !== "suite") return null

  const span = serviceDateSpan({
    supplierKind: anchorLeg.supplierKind,
    serviceDate: anchorState.serviceDate,
    nights: anchorState.nights,
    routeDurationDays: selectedRouteDurationDays(anchorLeg, anchorState.routeId),
    arrivalDate: anchorState.arrivalDate,
  })

  return { anchorLeg, span }
}

/** View-model form of {@link getTransferAnchorContext} — what the transport leg editor takes as a
 * prop. */
export interface TransferAnchorContext {
  legLabel: string
  legKind: SupplierKind
  startDate: string | null
  endDate: string | null
  /** endDate fell back to startDate because the anchor leg's route has no journey length set (or,
   *  for a flight, no arrival captured yet) — same situation the hotel editor flags for a train
   *  with no route duration. */
  endDateAssumed: boolean
}

export function toTransferAnchorContext(
  detail: PackageDetail,
  states: ApplyLegState[],
  transferLegId: string,
): TransferAnchorContext | null {
  const context = getTransferAnchorContext(detail, states, transferLegId)
  if (!context) return null

  return {
    legLabel: context.anchorLeg.label ?? context.anchorLeg.supplierName,
    legKind: context.anchorLeg.supplierKind,
    startDate: context.span?.start ?? null,
    endDate: context.span?.end ?? null,
    endDateAssumed: context.span != null && context.span.end === context.span.start,
  }
}

/** Recomputes the pickup date of every pre/post-anchored transfer request from the leg above it.
 * Runs after any state change so editing an upstream date (or a hotel's nights) re-dates every
 * transfer that hangs off it — including a chain of transfers, since each is resolved from the
 * *current* pass's states, not the pre-recompute ones. */
export function applyAnchoredTransferDates(
  detail: PackageDetail,
  states: ApplyLegState[],
): ApplyLegState[] {
  return states.map((state) => {
    if (state.kind !== "transport") return state

    const context = getTransferAnchorContext(detail, states, state.legId)
    const anchorDates: AnchorLegDates | null = context
      ? { start: context.span?.start ?? null, end: context.span?.end ?? null }
      : null

    let changed = false
    const requests = state.requests.map((request) => {
      if (request.serviceType !== "transfer") return request
      if (request.dateAnchor !== "pre" && request.dateAnchor !== "post") return request

      const targetDate = resolveTransferPickupDate(request.dateAnchor, anchorDates)
      if (!targetDate) return request

      // Rewrites only the date half of pickupAt — the consultant's typed time survives every
      // re-derive, and an unset time lands at local midnight, same as picking the date alone in
      // <DateTimePicker> does today.
      const parts = splitLocalDateTime(request.pickupAt)
      const nextPickupAt = joinLocalDateTime(targetDate, parts.time)
      if (!nextPickupAt || nextPickupAt === request.pickupAt) return request

      changed = true
      return { ...request, pickupAt: nextPickupAt }
    })

    return changed ? { ...state, requests } : state
  })
}

/** Recomputes the departure date of every pre/post-anchored airline leg from the leg above it —
 * same "nearest dated leg above, skipping transport/transfer" resolver a transfer's pickup date
 * uses, since a flight has no single canonical service (like a hotel's train) to hang off. Only
 * `serviceDate` (departure) is derived; `arrivalDate`/times stay independent manual fields. */
export function applyAnchoredAirlineDates(
  detail: PackageDetail,
  states: ApplyLegState[],
): ApplyLegState[] {
  return states.map((state) => {
    if (state.kind !== "suite" || state.supplierKind !== "airline") return state
    if (state.dateAnchor !== "pre" && state.dateAnchor !== "post") return state

    const context = getTransferAnchorContext(detail, states, state.legId)
    const anchorDates: AnchorLegDates | null = context
      ? { start: context.span?.start ?? null, end: context.span?.end ?? null }
      : null
    const targetDate = resolveTransferPickupDate(state.dateAnchor, anchorDates)
    if (!targetDate || targetDate === state.serviceDate) return state

    return { ...state, serviceDate: targetDate }
  })
}

/** Runs the hotel, airline, and transfer date-anchor recomputes in the order that makes chaining
 * work: a hotel anchors only to a train, so it settles first; an airline can anchor to that
 * now-settled hotel (or a train, or another leg above it), so it settles second; a transfer can
 * anchor to any of those, including a now-settled airline leg, so it settles last. Each recompute
 * reads only already-settled kinds ahead of it in this chain, so one pass each (rather than
 * repeating to a fixed point) is enough. */
export function applyAnchoredDates(detail: PackageDetail, states: ApplyLegState[]): ApplyLegState[] {
  return applyAnchoredTransferDates(
    detail,
    applyAnchoredAirlineDates(detail, applyAnchoredHotelDates(detail, states)),
  )
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
        .filter((request) => request.serviceId === fallback.legId)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
      return {
        ...fallback,
        selected: row?.selected ?? fallback.selected,
        routeId: row?.route_id ?? fallback.routeId,
        rateTypeId: row?.rate_type_id ?? fallback.rateTypeId,
        priceCurrency: row?.price_currency ?? fallback.priceCurrency,
        requests: legRequests.length > 0 ? legRequests : fallback.requests,
        bookingDate: row?.booking_date ?? fallback.bookingDate,
        confirmationDate: row?.confirmation_date ?? fallback.confirmationDate,
        paymentMadeDate: row?.payment_made_date ?? fallback.paymentMadeDate,
        paidWith: row?.paid_with ?? fallback.paidWith,
        origin: row?.origin ?? fallback.origin,
        updatedAt: row?.updated_at ?? null,
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
        manualAdultPrice: unit.manual_adult_price ?? null,
        manualChildPrice: unit.manual_child_price ?? null,
        manualInfantPrice: unit.manual_infant_price ?? null,
        manualRoomPrice: unit.manual_room_price ?? null,
        manualRoomPriceSetAt: unit.manual_room_price_set_at ?? null,
        complimentaryFirstNight: unit.complimentary_first_night ?? false,
        manualTourPrice: unit.manual_tour_price ?? null,
        manualTourPriceSetAt: unit.manual_tour_price_set_at ?? null,
        rateTypeId: unit.rate_type_id ?? null,
      }))

    const isHotel = fallback.supplierKind === "hotel_property"
    const isAirline = fallback.supplierKind === "airline"
    const leg = legById.get(fallback.legId)
    const chosenSuiteTypeIds = new Set(
      units.flatMap((unit) => (unit.suiteTypeId ? [unit.suiteTypeId] : [])),
    )
    const persistedRouteId = row.route_id
    const routeId =
      leg && isTypePricedSupplier(fallback.supplierKind)
        ? persistedRouteId && isTrustedRouteId(leg, persistedRouteId, chosenSuiteTypeIds)
          ? persistedRouteId
          : defaultRouteId(leg, chosenSuiteTypeIds)
        : persistedRouteId ?? fallback.routeId

    return {
      ...fallback,
      selected: row.selected,
      routeId,
      reversed: isRouteReversible(legById.get(fallback.legId), routeId)
        ? row.route_reversed ?? false
        : false,
      serviceDate: row.service_date ?? fallback.serviceDate,
      nights: isHotel ? row.nights ?? fallback.nights : null,
      // Postgres hands a `time` back as "10:00:00"; the editor and the API both speak HH:MM.
      departureTime: isAirline ? toHoursMinutes(row.departure_time) : null,
      arrivalDate: isAirline ? row.arrival_date ?? null : null,
      arrivalTime: isAirline ? toHoursMinutes(row.arrival_time) : null,
      flightNumber: isAirline ? row.flight_number ?? null : null,
      departureAirportCode: isAirline ? row.departure_airport_code ?? null : null,
      arrivalAirportCode: isAirline ? row.arrival_airport_code ?? null : null,
      handLuggageKg: isAirline ? row.hand_luggage_kg ?? null : null,
      checkedLuggageKg: isAirline ? row.checked_luggage_kg ?? null : null,
      // No saved anchor (pre-existing booking, or seeded by intake) falls back to the package's.
      dateAnchor:
        isHotel || isAirline ? normalizeSavedAnchor(row.date_anchor) ?? fallback.dateAnchor : null,
      notes: row.notes,
      luggageStorageAvailable: isHotel ? row.luggage_storage_available ?? false : false,
      rateTypeId: row.rate_type_id ?? fallback.rateTypeId,
      priceCurrency: row.price_currency ?? fallback.priceCurrency,
      units: units.length > 0 ? units : fallback.units,
      bookingDate: row.booking_date ?? fallback.bookingDate,
      confirmationDate: row.confirmation_date ?? fallback.confirmationDate,
      paymentMadeDate: row.payment_made_date ?? fallback.paymentMadeDate,
      paidWith: row.paid_with ?? fallback.paidWith,
      origin: row.origin ?? fallback.origin,
      updatedAt: row.updated_at ?? null,
    } satisfies SuiteLegState
  })

  return applyAnchoredDates(detail, hydrated)
}

/** PATCH /api/jobs/[id]/package-selections body. */
export interface PackageSelectionsPatchBody {
  selections: Array<{
    packageLegId: string
    /** Optimistic-lock token: the row version this leg was hydrated from. */
    expectedUpdatedAt?: string
    selected: boolean
    routeId: string | null
    routeReversed?: boolean
    serviceDate?: string | null
    nights?: number | null
    /** Airline legs only — the server rejects them on any other supplier kind. */
    departureTime?: string | null
    arrivalDate?: string | null
    arrivalTime?: string | null
    flightNumber?: string | null
    departureAirportCode?: string | null
    arrivalAirportCode?: string | null
    handLuggageKg?: number | null
    checkedLuggageKg?: number | null
    dateAnchor?: ServiceDateAnchor | null
    rateTypeId?: string | null
    priceCurrency?: string
    notes?: string | null
    /** Hotel legs only — the server rejects it on any other supplier kind. */
    luggageStorageAvailable?: boolean
    bookingDate?: string | null
    confirmationDate?: string | null
    paymentMadeDate?: string | null
    paidWith?: string | null
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
      manualAdultPrice: number | null
      manualChildPrice: number | null
      manualInfantPrice: number | null
      /** Hotel legs only — the server rejects it on any other supplier kind. */
      manualRoomPrice: number | null
      /** Hotel legs only — the gifted first night, same server-side restriction. */
      complimentaryFirstNight: boolean
      /** Tour legs only — the server rejects it on any other supplier kind. */
      manualTourPrice: number | null
      /** Tour legs only — the server rejects it on any other supplier kind. */
      rateTypeId: string | null
    }>
  }>
}

export function toPackageSelectionsPatch(states: ApplyLegState[]): PackageSelectionsPatchBody {
  return {
    selections: states.map((state) => {
      if (state.kind === "transport") {
        return {
          packageLegId: state.legId,
          ...(state.updatedAt ? { expectedUpdatedAt: state.updatedAt } : {}),
          selected: state.selected,
          routeId: state.routeId,
          rateTypeId: state.rateTypeId,
          priceCurrency: state.priceCurrency,
          bookingDate: state.bookingDate,
          confirmationDate: state.confirmationDate,
          paymentMadeDate: state.paymentMadeDate,
          paidWith: state.paidWith,
        }
      }
      return {
        packageLegId: state.legId,
        ...(state.updatedAt ? { expectedUpdatedAt: state.updatedAt } : {}),
        selected: state.selected,
        routeId: state.routeId,
        routeReversed: state.reversed,
        serviceDate: state.serviceDate,
        nights: state.supplierKind === "hotel_property" ? Math.max(1, state.nights ?? 1) : null,
        // Sent only for airlines: the server refuses these fields on any other kind, so a hotel
        // leg posting an explicit null would 400 rather than quietly clear nothing.
        ...(state.supplierKind === "airline"
          ? {
              departureTime: state.departureTime,
              arrivalDate: state.arrivalDate,
              arrivalTime: state.arrivalTime,
              flightNumber: state.flightNumber,
              departureAirportCode: state.departureAirportCode,
              arrivalAirportCode: state.arrivalAirportCode,
              handLuggageKg: state.handLuggageKg,
              checkedLuggageKg: state.checkedLuggageKg,
            }
          : {}),
        dateAnchor:
          state.supplierKind === "hotel_property" || state.supplierKind === "airline"
            ? state.dateAnchor
            : null,
        rateTypeId: state.rateTypeId,
        priceCurrency: state.priceCurrency,
        notes: state.notes,
        // Sent only for hotels: the server refuses this field on any other kind (see the guard
        // in PATCH /api/jobs/[id]/services).
        ...(state.supplierKind === "hotel_property"
          ? { luggageStorageAvailable: state.luggageStorageAvailable }
          : {}),
        bookingDate: state.bookingDate,
        confirmationDate: state.confirmationDate,
        paymentMadeDate: state.paymentMadeDate,
        paidWith: state.paidWith,
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
          manualAdultPrice: unit.manualAdultPrice,
          manualChildPrice: unit.manualChildPrice,
          manualInfantPrice: unit.manualInfantPrice,
          manualRoomPrice: state.supplierKind === "hotel_property" ? unit.manualRoomPrice : null,
          complimentaryFirstNight:
            state.supplierKind === "hotel_property" ? unit.complimentaryFirstNight : false,
          manualTourPrice: state.supplierKind === "tour_operator" ? unit.manualTourPrice : null,
          rateTypeId: state.supplierKind === "tour_operator" ? unit.rateTypeId : null,
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
    serviceId: string | null
    pickupPoint: string
    dropoffPoint: string
    pickupAt: string | null
    /** Transfers only — a rental is always sent null; the server rejects pre/post on one. */
    dateAnchor: ServiceDateAnchor | null
    rentalDetails: { returnAt: string | null; returnCutoffTime: string | null } | null
    passengerCount: number | null
    luggageCount: number | null
    flightNumber: string | null
    priceOverride: number | null
    complimentary: boolean
    notes: string | null
    /** Transfers only, always 'per_vehicle' for a rental — see lib/pricing/transfer-basis.ts. */
    pricingBasis: "per_vehicle" | "per_person"
    adultCount: number | null
    childCount: number | null
    infantCount: number | null
    priceOverrideChild: number | null
    priceOverrideInfant: number | null
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
  const untouched = existing.filter((request) => !request.serviceId)
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
      serviceId: request.serviceId,
      pickupPoint: request.pickupPoint,
      dropoffPoint: request.dropoffPoint,
      pickupAt: request.pickupAt,
      dateAnchor: request.serviceType === "transfer" ? request.dateAnchor : null,
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
      complimentary: request.complimentary,
      notes: request.notes,
      pricingBasis: request.pricingBasis,
      adultCount: request.adultCount,
      childCount: request.childCount,
      infantCount: request.infantCount,
      priceOverrideChild: request.priceOverrideChild,
      priceOverrideInfant: request.priceOverrideInfant,
      sortOrder: index,
    })),
  }
}

export interface ApplyCommissionOverride {
  type: CommissionKind
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
    /** booking_service_units.id for a saved room; absent for one added since the last save. Only
     *  used server-side to look up the room override's provenance. */
    unitId?: string
    suiteTypeId: string
    bedroomTypeId: string | null
    bedroomLayoutId: string | null
    bathroomTypeId: string | null
    adultCount: number
    childCount: number
    infantCount: number
    manualAdultPrice: number | null
    manualChildPrice: number | null
    manualInfantPrice: number | null
    /** Hotel legs only: replaces the rate card's per-room-per-night price for this room. */
    manualRoomPrice: number | null
    /** Hotel legs only: the gifted first night, dropping one night from the charged count. */
    complimentaryFirstNight: boolean
    /** Tour legs only: replaces the rate-card-computed total for this unit. */
    manualTourPrice: number | null
    /** Tour legs only: this unit's own rate type, overriding the leg's rateTypeId below. */
    rateTypeId?: string | null
  }>
  nights?: number
  /** Per-leg rate type override; omitted falls back to the system default. */
  rateTypeId?: string
  /** The currency this leg's hand-typed prices are in; converted into the quote currency at
   *  pricing time. Ignored by rate-card legs, which use the card's own currency. */
  priceCurrency?: string
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
        priceCurrency: state.priceCurrency,
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
          unitId: unit.id.startsWith("draft-") ? undefined : unit.id,
          suiteTypeId: unit.suiteTypeId,
          bedroomTypeId: unit.bedroomTypeId,
          bedroomLayoutId: unit.bedroomLayoutId,
          bathroomTypeId: unit.bathroomTypeId,
          adultCount: unit.adultCount,
          childCount: unit.childCount,
          infantCount: unit.infantCount,
          manualAdultPrice: unit.manualAdultPrice,
          manualChildPrice: unit.manualChildPrice,
          manualInfantPrice: unit.manualInfantPrice,
          manualRoomPrice: state.supplierKind === "hotel_property" ? unit.manualRoomPrice : null,
          complimentaryFirstNight:
            state.supplierKind === "hotel_property" ? unit.complimentaryFirstNight : false,
          manualTourPrice: state.supplierKind === "tour_operator" ? unit.manualTourPrice : null,
          rateTypeId: state.supplierKind === "tour_operator" ? unit.rateTypeId ?? undefined : undefined,
        })),
      nights:
        state.supplierKind === "hotel_property" ? Math.max(1, state.nights ?? 1) : undefined,
      rateTypeId: state.rateTypeId ?? undefined,
      priceCurrency: state.priceCurrency,
      commissionOverride,
    }
  })
}

export interface ValidateConfigureStateOptions {
  totalsBySupplierId?: Record<string, PassengerTotals>
  /** Names the chosen rate type in pricing errors. Without it a rate-type miss still blocks, it
   * just reports the raw id — so a caller that hasn't loaded rate types stays safe. */
  rateTypes?: { id: string; name: string }[]
}

/** Distinguishes "this route+type was never priced" from "priced, but not on this date", and both
 * from "priced, but not for the rate type you picked" — mirrors the three-case error thrown at
 * build time in lib/quotes/build-from-package.ts. Keep the two in sync. */
function describeMissingRateCard(
  leg: PackageLeg,
  routeId: string,
  suiteTypeId: string,
  pricingDate: string,
  rateTypeId?: string | null,
  rateTypeNameById?: Map<string, string>,
): string | null {
  const suiteTypeName = leg.suiteTypes.find((s) => s.id === suiteTypeId)?.name ?? "this type"
  // A tour operator's itinerary saves with a blank name (see app/api/suppliers/[slug]/route.ts),
  // so `||` here (not `??`) is deliberate -- an empty string must fall back same as a missing route.
  const routeName = leg.routes.find((r) => r.id === routeId)?.name || "this route"
  const where = `"${suiteTypeName}" on "${routeName}"`

  if (findRateCardCandidates(leg.rateCards, routeId, suiteTypeId, pricingDate).length === 0) {
    return hasAnyRateCardFor(leg.rateCards, routeId, suiteTypeId)
      ? `no rate card covers ${pricingDate} for ${where} — extend the validity period or add a new one`
      : `no rate card for ${where} — add one under Suppliers → ${leg.supplierName}`
  }

  // Cards exist on this date. An explicitly chosen rate type must be among them: the builder
  // refuses to substitute another rate's price, so catch it here rather than at Apply.
  if (!rateTypeId) return null
  const covered = findRateCardCandidates(leg.rateCards, routeId, suiteTypeId, pricingDate).some(
    (card) => card.rateTypeId === rateTypeId,
  )
  if (covered) return null
  const label = rateTypeNameById?.get(rateTypeId) ?? rateTypeId
  return hasAnyRateCardForRateType(leg.rateCards, routeId, suiteTypeId, rateTypeId)
    ? `no "${label}" rate covers ${pricingDate} for ${where} — extend that rate's validity period or add a rate card`
    : `"${label}" has no rate card for ${where} — add one under Suppliers → ${leg.supplierName}`
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
  const rateTypeNameById = new Map((options.rateTypes ?? []).map((rt) => [rt.id, rt.name]))

  for (const state of states) {
    if (!state.selected) continue
    const leg = legById.get(state.legId)
    if (!leg) continue
    const legLabel = leg.label ?? leg.supplierName

    // Transport legs don't require a route: preset routes are only quick-fill templates for the
    // pickup/drop-off fields, and pricing comes from the vehicle-category rate card. A tour
    // operator prices the tour type alone -- its itinerary is descriptive copy, so a tour leg
    // with zero itineraries is still priceable and must not be blocked here (matches the pricing
    // engine's own rule in lib/quotes/build-from-package.ts).
    if (state.kind !== "transport" && !isTypePricedSupplier(state.supplierKind)) {
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
        if (request.serviceType === "rental" && !request.rentalDetails?.returnAt) {
          errors.push(`${label}: return date/time is required`)
        }
        if (leg.suiteTypes.length > 0 && !request.suiteTypeId) {
          errors.push(`${label}: select a vehicle category`)
        }
        // A pre/post anchor that can't resolve yet (nothing dated above it, or the leg above has
        // no date yet) leaves pickupAt null — catch that here with a readable next step, rather
        // than letting it fall through to a generic missing-date error further down.
        if (request.dateAnchor === "pre" || request.dateAnchor === "post") {
          const anchorContext = toTransferAnchorContext(detail, states, state.legId)
          const resolved = resolveTransferPickupDate(
            request.dateAnchor,
            anchorContext ? { start: anchorContext.startDate, end: anchorContext.endDate } : null,
          )
          if (!resolved) {
            errors.push(
              anchorContext
                ? `${label}: set ${anchorContext.legLabel}'s date, or pick a custom pickup date`
                : `${label}: nothing above this transfer has a date to anchor to — pick a custom pickup date`,
            )
          }
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
            state.rateTypeId,
            rateTypeNameById,
          )
          if (pricingError) errors.push(`${label}: ${pricingError}`)
        }
      })
      continue
    }

    // An inverted flight is a typo the server refuses outright, so catch it here rather than let
    // the Next sequence fail on a 400 the consultant has to translate back to a field.
    if (state.supplierKind === "airline" && state.arrivalDate && state.serviceDate) {
      if (state.arrivalDate < state.serviceDate) {
        errors.push(`${legLabel}: the flight cannot arrive before it departs`)
      } else if (
        state.arrivalDate === state.serviceDate &&
        state.arrivalTime &&
        state.departureTime &&
        state.arrivalTime <= state.departureTime
      ) {
        errors.push(
          `${legLabel}: a flight arriving on its departure day must arrive after it departs — set a later arrival time, or an arrival date of the next day`,
        )
      }
    }

    const unitVocab = SUPPLIER_VOCABULARY[leg.supplierKind]
    if (leg.suiteTypes.length === 0) {
      // Nothing to pick a type from yet -- skip the per-unit "needs a type" noise below and
      // point straight at the supplier, same as the routes/meal-plans check above.
      errors.push(
        `${legLabel}: no ${unitVocab.unitNounPlural} set up for this supplier — add one in Suppliers first`,
      )
    } else if (state.units.length === 0) {
      errors.push(`${legLabel}: add at least one ${unitVocab.unitNoun}`)
    }
    state.units.forEach((unit, index) => {
      if (leg.suiteTypes.length === 0) return
      if (!unit.suiteTypeId) {
        errors.push(`${legLabel}: ${unitVocab.unitNoun} ${index + 1} needs a type`)
      } else if (
        leg.pricingMode !== "manual" &&
        (unit.manualRoomPrice ?? null) === null &&
        (unit.manualTourPrice ?? null) === null &&
        // A tour operator's rate cards carry no route (isTypePricedSupplier), so an itinerary-less
        // tour leg still has everything it needs to price -- routeId is never a precondition for
        // it, unlike every other kind here.
        (state.routeId || isTypePricedSupplier(state.supplierKind)) &&
        state.serviceDate
      ) {
        // Manual-pricing legs (e.g. airlines) have no rate card to check -- the fare is typed
        // in, and a blank one is allowed here (flagged as pricing_incomplete on the quote
        // instead of blocking the itinerary from being built).
        //
        // A room or tour unit with its own typed override price is the same situation one unit
        // at a time: it never reads the card, so a missing one is not an error to raise against it.
        const pricingError = describeMissingRateCard(
          leg,
          state.routeId ?? "",
          unit.suiteTypeId,
          state.serviceDate,
          // Tours resolve their rate type per unit; every other kind uses the one leg-level value.
          unit.rateTypeId ?? state.rateTypeId,
          rateTypeNameById,
        )
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

    if (PASSENGER_SUM_SUPPLIER_KINDS.has(state.supplierKind)) {
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
            `${legLabel}: ${unitVocab.unitNounPlural} hold ${summed.adultCount} adults, ${summed.childCount} children, ` +
              `${summed.infantCount} infants but the booking is for ${totals.adultCount} adults, ` +
              `${totals.childCount} children, ${totals.infantCount} infants. Update the booking's ` +
              `travellers above, or adjust the ${unitVocab.unitNoun} split.`,
          )
        }
      }
    }
  }

  return errors
}
