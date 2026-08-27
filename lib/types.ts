// `consultant` is the lowest clearance level. The database enum still carries a
// retired `readonly` value (Postgres cannot drop enum labels) — it is not a Role.
export type Role = "admin" | "manager" | "consultant"

export type Purpose = "quote" | "availability" | "reservation"
export type Source =
  | "web_form"
  | "paste_import"
  | "advertisement"
  | "walk_in"
  | "referral"
  | "social_media"
  | "phone_call"
  | "email"
  | "travel_agent"

export type ConsultantAbbreviation = "LB" | "CDJ" | "DR" | "MVE" | "DL"

export interface AppSettings {
  defaultDepositPercentage: number
}

export const CONSULTANTS: { key: ConsultantAbbreviation; name: string }[] = [
  { key: "LB", name: "Leonie" },
  { key: "CDJ", name: "Carmen" },
  { key: "DR", name: "Dirk" },
  { key: "MVE", name: "Monade" },
  { key: "DL", name: "Douwlien" },
]

export type PipelineStage =
  | "enquiry"
  | "quoted"
  | "quote_sent"
  | "accepted"
  | "form_done"
  | "deposit_requested"
  | "payment_schedule"
  | "deposit_paid"
  | "final_paid"
  | "voucher_sent"
  | "trip_active"
  | "closed"
  | "lost"

export const LEGACY_PIPELINE_STAGE_MAP: Partial<Record<PipelineStage, PipelineStage>> = {
  quoted: "quote_sent",
  form_done: "accepted",
  payment_schedule: "deposit_requested",
  trip_active: "voucher_sent",
}

export function getCanonicalPipelineStage(stage: PipelineStage): PipelineStage {
  return LEGACY_PIPELINE_STAGE_MAP[stage] ?? stage
}

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: "enquiry", label: "Enquiry" },
  { key: "quote_sent", label: "Quote Sent" },
  { key: "accepted", label: "Quote Accepted" },
  { key: "deposit_requested", label: "Deposit Invoice Sent" },
  { key: "deposit_paid", label: "Deposit Paid" },
  { key: "final_paid", label: "Paid in Full" },
  { key: "voucher_sent", label: "Voucher Sent" },
  { key: "closed", label: "Closed" },
  { key: "lost", label: "Lost" },
]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  enquiry: "Enquiry",
  quoted: "Quote Sent",
  quote_sent: "Quote Sent",
  accepted: "Quote Accepted",
  form_done: "Quote Accepted",
  deposit_requested: "Deposit Invoice Sent",
  payment_schedule: "Deposit Invoice Sent",
  deposit_paid: "Deposit Paid",
  final_paid: "Paid in Full",
  voucher_sent: "Voucher Sent",
  trip_active: "Voucher Sent",
  closed: "Closed",
  lost: "Lost",
}

export function getPipelineStageLabel(stage: PipelineStage | string): string {
  return PIPELINE_STAGE_LABELS[stage as PipelineStage] ?? stage.replace(/_/g, " ")
}

// Kanban board stages - active booking workflow only.
export const KANBAN_STAGES: { key: PipelineStage; label: string; includes: PipelineStage[] }[] = [
  { key: "quote_sent", label: "Quote Sent", includes: ["quote_sent", "quoted"] },
  { key: "accepted", label: "Quote Accepted", includes: ["accepted", "form_done"] },
  { key: "deposit_requested", label: "Deposit Invoice Sent", includes: ["deposit_requested", "payment_schedule"] },
  { key: "deposit_paid", label: "Deposit Paid", includes: ["deposit_paid"] },
  { key: "final_paid", label: "Paid in Full", includes: ["final_paid"] },
  { key: "voucher_sent", label: "Voucher Sent", includes: ["voucher_sent", "trip_active"] },
]

export interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  fax?: string | null
  country: string | null
  province?: string | null
  title?: string | null
  companyName?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  postalCode?: string | null
  vatNumber?: string | null
  notes?: string | null
  dateOfBirth?: string | null
  idPassport?: string | null
  vipStatus?: boolean
  preferences?: string | null
  communicationPreferences?: string | null
  firstTravelDate?: string | null
  firstTravelDateDisplay?: string
  lastTravelDate?: string | null
  lastTravelDateDisplay?: string
  isRepeatClient?: boolean
  createdAt: string
  createdAtDisplay?: string
  updatedAt?: string
  updatedAtDisplay?: string
}

export interface CustomerLinkedAccount {
  id: string
  customerId: string
  linkedCustomerId: string | null
  linkedCustomerName: string | null
  relationship: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  isMirror: boolean
  createdAt: string
}

// Booking is the primary entity — replaces the old Job + Enquiry combination.
export interface Booking {
  id: string
  bookingNumber: string
  customerId: string
  stage: PipelineStage
  purpose: Purpose
  source: Source
  consultant: string | null
  ownerUserId: string | null
  assignedSalespersonId: string | null
  assignedSalespersonName?: string | null
  isRepeatClientAtCreation: boolean
  departureDate: string | null
  departureDateDisplay?: string
  durationNights: number | null
  tripEndDate?: string | null
  thankYouScheduledAt?: string | null
  emailImportNeedsReview: boolean
  emailImportReviewResolvedAt: string | null
  emailImportReviewResolvedAtDisplay?: string
  emailImportMissingFields: string[]
  emailImportWarnings: string[]
  emailImportSourceMessageId: string | null
  emailImportDuplicateOfBookingId: string | null
  emailImportSubject: string | null
  emailImportMailbox: string | null
  emailImportReceivedAt: string | null
  emailImportReceivedAtDisplay?: string
  emailImportRawPreview: string | null
  noOfAdults: number
  noOfChildren: number
  noOfSuites: number
  childAges: number[] | null
  routeId: string | null
  direction: string | null
  supplierName?: string | null
  rawText: string | null
  extractedJson: unknown
  termsAccepted: boolean
  additionalServices: boolean
  additionalServicesDetails: string | null
  promotionCode: string | null
  extendStay: boolean
  extraNights: number | null
  hotelPhase: string
  hotelSupplierId: string | null
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
  quoteSentAt: string | null
  acceptedAt: string | null
  reservationFormReceivedAt?: string | null
  depositRequestedAt: string | null
  depositPaidAt: string | null
  finalPaidAt: string | null
  voucherSentAt: string | null
  closedAt: string | null
  depositPaid: boolean
  invoiceBalance: number | null
  /** Received above the accepted quote total. Zero unless the booking is overpaid. */
  overpaidAmount?: number | null
  cancelledAt: string | null
  cancelledAtDisplay?: string
  refundStatus: "refunded" | "not_refunded" | null
  refundAmount: number | null
  refundReference: string | null
  refundedAt: string | null
  outcome: Outcome
  outcomeReasonId: string | null
  outcomeNotes: string | null
  outcomeSetAt: string | null
  outcomeSetAtDisplay?: string
  outcomeSetBy: string | null
}

export type Outcome = "Open" | "Won" | "Lost" | "Cancelled"

export interface OutcomeReason {
  id: string
  label: string
  appliesTo: "Lost" | "Cancelled" | "Both"
  active: boolean
  createdAt: string
}

export type SupplierKind =
  | "train_operator"
  | "hotel_property"
  | "transfers"
  | "vehicle_rental"
  | "tour_operator"
  | "airline"
export type SupplierStatus = "draft" | "active" | "inactive" | "temporary"
export type TransportRequestServiceType = "transfer" | "rental"
export type TransportServiceType = TransportRequestServiceType

/** Every currency a supplier rate or a quote may be denominated in. ZAR is the base: foreign
 *  rates convert into the quote's currency at build time. Adding one here is enough for the
 *  supplier and quote dropdowns; `lib/fx/rates.ts` fetches whatever this list contains. */
export const CURRENCIES = [
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
] as const satisfies readonly { value: string; label: string }[]

export type SupportedCurrency = (typeof CURRENCIES)[number]["value"]

export const SUPPORTED_CURRENCY_VALUES = CURRENCIES.map((entry) => entry.value) as [
  SupportedCurrency,
  ...SupportedCurrency[],
]

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  train_operator: "Train",
  hotel_property: "Hotel",
  transfers: "Transfers",
  vehicle_rental: "Vehicle Rental",
  tour_operator: "Tours",
  airline: "Airlines",
}

export interface SupplierVocabulary {
  suiteType: string
  suiteTypePlural: string
  /** What one bookable unit is called in prose ("room 1 needs a type"). `suiteType` is the
   *  configuration label ("Room Type"); this is the thing itself. */
  unitNoun: string
  unitNounPlural: string
  package: string
  packagePlural: string
  route: string
  routePlural: string
  sectionTitle: string
  sectionDescription: string
  priceLabel: string
  routeHasLocations: boolean
  /** Whether the route exposes the one-way/round-trip Direction selector. Only meaningful for point-to-point journey suppliers where a return trip doubles the fare (trains, airlines). */
  routeHasDirection: boolean
  /** Whether the route exposes a "Duration (days)" input for admins to record how long the journey takes. Train operators only; feeds the itinerary. */
  routeHasDuration: boolean
  /** Whether the route exposes its own departure/arrival time inputs. Train operators only — every
   * other kind still reads its times off the supplier (`defaultTimeStart`/`defaultTimeEnd`). */
  routeHasSchedule: boolean
  /** Whether the route name is auto-filled from origin/destination + direction while the name is empty; user edits always win. Train operators only. */
  routeNameAutoDerived: boolean
  showSingleSupplement: boolean
  showDurationNights: boolean
  originLabel: string
  destinationLabel: string
  durationLabel: string
  scheduleFields?: {
    dateFromLabel: string
    dateToLabel: string
    timeStartLabel: string
    timeEndLabel: string
  }
}

const JOURNEY_SUPPLIER_VOCABULARY: SupplierVocabulary = {
  suiteType: "Suite Type",
  suiteTypePlural: "Suite Types",
  unitNoun: "suite",
  unitNounPlural: "suites",
  package: "Package",
  packagePlural: "Packages",
  route: "Route",
  routePlural: "Routes",
  sectionTitle: "Suite Types, Routes and Rates",
  sectionDescription:
    "Manage the suite types this supplier offers, the routes they cover, and period-based rates.",
  priceLabel: "per person sharing",
  routeHasLocations: true,
  routeHasDirection: true,
  routeHasDuration: true,
  routeHasSchedule: true,
  routeNameAutoDerived: true,
  showSingleSupplement: true,
  showDurationNights: true,
  originLabel: "Origin",
  destinationLabel: "Destination",
  durationLabel: "nights",
  scheduleFields: {
    dateFromLabel: "Departure date",
    dateToLabel: "Arrival date",
    timeStartLabel: "Departure time",
    timeEndLabel: "Arrival time",
  },
}

export const SUPPLIER_VOCABULARY: Record<SupplierKind, SupplierVocabulary> = {
  train_operator: JOURNEY_SUPPLIER_VOCABULARY,

  hotel_property: {
    suiteType: "Room Type",
    suiteTypePlural: "Room Types",
    unitNoun: "room",
    unitNounPlural: "rooms",
    package: "Season",
    packagePlural: "Seasons",
    route: "Meal Plan",
    routePlural: "Meal Plans",
    sectionTitle: "Room Types, Meal Plans and Rates",
    sectionDescription:
      "Manage room types, meal plans, and period-based rates.",
    priceLabel: "per room per night",
    routeHasLocations: false,
    routeHasDirection: false,
    routeHasDuration: false,
    routeHasSchedule: false,
    routeNameAutoDerived: false,
    showSingleSupplement: false,
    showDurationNights: false,
    originLabel: "Origin",
    destinationLabel: "Destination",
    durationLabel: "nights",
    scheduleFields: {
      dateFromLabel: "Check-in date",
      dateToLabel: "Check-out date",
      timeStartLabel: "Check-in time",
      timeEndLabel: "Check-out time",
    },
  },

  transfers: {
    suiteType: "Vehicle Type",
    suiteTypePlural: "Vehicle Types",
    unitNoun: "vehicle",
    unitNounPlural: "vehicles",
    package: "Service",
    packagePlural: "Services",
    route: "Service",
    routePlural: "Services",
    sectionTitle: "Vehicle Types, Services and Rates",
    sectionDescription:
      "Manage transfer services, pickup/drop-off points, vehicle types, and period-based rates.",
    priceLabel: "per vehicle",
    routeHasLocations: true,
    routeHasDirection: true,
    routeHasDuration: false,
    routeHasSchedule: false,
    routeNameAutoDerived: false,
    showSingleSupplement: false,
    showDurationNights: false,
    originLabel: "Pickup",
    destinationLabel: "Drop-off",
    durationLabel: "nights",
  },

  vehicle_rental: {
    suiteType: "Vehicle Type",
    suiteTypePlural: "Vehicle Types",
    unitNoun: "vehicle",
    unitNounPlural: "vehicles",
    package: "Rental Service",
    packagePlural: "Rental Services",
    route: "Rental Route",
    routePlural: "Rental Routes",
    sectionTitle: "Vehicle Types, Rental Services and Rates",
    sectionDescription:
      "Manage vehicle types, rental pickup/return points, rental terms, and period-based rates.",
    priceLabel: "per day",
    routeHasLocations: true,
    routeHasDirection: false,
    routeHasDuration: false,
    routeHasSchedule: false,
    routeNameAutoDerived: false,
    showSingleSupplement: false,
    showDurationNights: false,
    originLabel: "Pickup point",
    destinationLabel: "Return point",
    durationLabel: "days",
    scheduleFields: {
      dateFromLabel: "Pickup date",
      dateToLabel: "Return date",
      timeStartLabel: "Pickup time",
      timeEndLabel: "Return time",
    },
  },

  tour_operator: {
    suiteType: "Tour Type",
    suiteTypePlural: "Tour Types",
    unitNoun: "tour",
    unitNounPlural: "tours",
    package: "Event",
    packagePlural: "Events",
    route: "Itinerary",
    routePlural: "Itineraries",
    sectionTitle: "Tour Types, Itineraries and Rates",
    sectionDescription:
      "Manage the tour types this operator offers, itineraries, and per-person pricing.",
    priceLabel: "per person",
    routeHasLocations: false,
    routeHasDirection: false,
    routeHasDuration: false,
    routeHasSchedule: false,
    routeNameAutoDerived: true,
    showSingleSupplement: true,
    showDurationNights: true,
    originLabel: "Origin",
    destinationLabel: "Destination",
    durationLabel: "days",
  },

  airline: {
    suiteType: "Cabin",
    suiteTypePlural: "Cabins",
    unitNoun: "cabin",
    unitNounPlural: "cabins",
    package: "Season",
    packagePlural: "Seasons",
    route: "Route",
    routePlural: "Routes",
    sectionTitle: "Cabins, Routes and Rates",
    sectionDescription:
      "Manage the cabins this airline offers, routes, and per-person pricing.",
    priceLabel: "per person",
    routeHasLocations: true,
    routeHasDirection: true,
    routeHasDuration: false,
    routeHasSchedule: false,
    routeNameAutoDerived: false,
    showSingleSupplement: true,
    showDurationNights: false,
    originLabel: "Origin",
    destinationLabel: "Destination",
    durationLabel: "nights",
  },
}

export function getSupplierVocabulary(kind: SupplierKind): SupplierVocabulary {
  return SUPPLIER_VOCABULARY[kind]
}

export function isTransportSupplier(kind: SupplierKind): boolean {
  return kind === "transfers" || kind === "vehicle_rental"
}

/**
 * SUPPLIER_VOCABULARY.priceLabel stays static per kind ("per vehicle" for every transfer
 * supplier) because it's a Record indexed by SupplierKind alone, and a couple of call sites
 * (e.g. components/supplier-detail-view.tsx's `vocabulary.priceLabel === "per day"` rental
 * check) rely on that Record never changing shape. A transfer supplier's actual label depends
 * on its per-supplier (or per-leg) pricing basis too, so this is the one place that resolves
 * both together — everywhere else keeps reading SUPPLIER_VOCABULARY[kind].priceLabel directly.
 */
export function resolveSupplierPriceLabel(
  kind: SupplierKind,
  opts?: { transferPricingBasis?: "per_vehicle" | "per_person" | null },
): string {
  if (kind === "transfers" && opts?.transferPricingBasis === "per_person") return "per person"
  return SUPPLIER_VOCABULARY[kind].priceLabel
}

/**
 * True for suppliers whose price hangs off the type alone (a tour operator sells a tour type at one
 * price, whatever itinerary it is described by), so their rate cards carry no route and their
 * routes are descriptive instead: one itinerary belongs to one tour type and holds its own copy.
 * Every other kind prices route x type, where the route genuinely changes the fare.
 */
export function isTypePricedSupplier(kind: SupplierKind): boolean {
  return kind === "tour_operator"
}

export function isOptionalPackageLegKind(kind: SupplierKind): boolean {
  return kind !== "train_operator"
}

export interface Location {
  id: string
  name: string
  country: string
  parentLocationId: string | null
  regionCode: string | null
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export type RouteDirectionMode = "one_way" | "round_trip"

export type CommissionKind = "percent" | "per_person" | "fixed"

export interface CommissionConfig {
  type: CommissionKind
  value: number
}

export type CommissionSource = "line" | "none"

export interface ResolvedCommission {
  type: CommissionKind | null
  value: number
  source: CommissionSource
}

export interface CommissionBreakdown {
  type: CommissionKind
  value: number
  /** The calculated commission, always excluding `bonus`, so re-applying a bonus never compounds. */
  amount: number
  source: CommissionSource
  /** Flat manual top-up folded into the same Commission line (quotes.commission_bonus). */
  bonus?: number
  /** Booking headcount used for a per_person calculation, kept so the canonical
   *  qty/unitPrice shape can be restored when the bonus is cleared. */
  passengerCount?: number
}

export interface SupplierRoute {
  id: string
  supplierId: string
  name: string
  originLocationId: string | null
  destinationLocationId: string | null
  /** Endpoint display names, resolved from the location ids. Used to render the booked travel
   * direction (origin → destination, or the reverse) on documents. */
  originLocationName?: string | null
  destinationLocationName?: string | null
  pickupPoint?: string | null
  dropoffPoint?: string | null
  vehicleRentalDetails?: VehicleRentalRouteDetails | null
  directionMode?: RouteDirectionMode
  /** Trip length in whole days; train routes only, null otherwise. */
  durationDays?: number | null
  /** HH:MM departure/arrival of the outbound leg; train routes only, null otherwise. Printed on the
   * quote itinerary, itinerary PDF and voucher, and prefilled on new booking schedules. */
  departureTime?: string | null
  arrivalTime?: string | null
  /** Same, for the return leg of a two-way route (`directionMode === "round_trip"`). A booking
   * travelling in reverse (`route_reversed`) renders these instead; null on one-way routes. */
  returnDepartureTime?: string | null
  returnArrivalTime?: string | null
  /** Tour operators only: the tour type this itinerary belongs to. Itineraries describe a tour
   * type, they never price it — the rate card hangs off the tour type itself. Null on every
   * other supplier kind, whose routes are a pricing dimension rather than a description. */
  suiteTypeId?: string | null
  /** Tour operators only: what this itinerary covers, printed on quotes and vouchers. */
  description?: string | null
  active: boolean
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface VehicleRentalRouteDetails {
  routeId: string
  includedKmPerDay: number | null
  extraKmPrice: number | null
  securityDeposit: number | null
  oneWayFee: number | null
  createdAt: string
  updatedAt: string
}

export interface SupplierVariantValue {
  id: string
  name: string
  sortOrder: number
  archivedAt: string | null
}

export interface SupplierSuiteAlias {
  axis: "suiteType" | "bedroomType" | "bedroomLayout" | "bathroomType"
  /** Already normalized; matched by exact equality only, never fuzzily. */
  phrase: string
  targetId: string
  status: "provisional" | "confirmed"
}

export interface SupplierSuiteType {
  id: string
  supplierId: string
  name: string
  passengerCapacity?: number | null
  luggageCapacity?: number | null
  description?: string | null
  active: boolean
  sortOrder?: number
  bedroomTypeIds?: string[]
  bedroomLayoutIds?: string[]
  bathroomTypeIds?: string[]
  bedroomTypes?: string[]
  bedroomLayouts?: string[]
  bathroomTypes?: string[]
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface SupplierRateCard {
  id: string
  /** Null on a tour operator's card: it prices the tour type across every itinerary. */
  routeId: string | null
  suiteTypeId: string
  rateTypeId: string
  pricePerPerson: number
  childPrice: number | null
  infantPrice: number | null
  currency: string
  validFrom: string
  validFromDisplay?: string
  validTo: string | null
  validToDisplay?: string
  createdAt: string
  createdAtDisplay?: string
}

export interface RateType {
  id: string
  code: string
  name: string
  sortOrder: number
  isDefault: boolean
  isStandard: boolean
  /** Seeds quotes.rate_audience's Auto default (lib/quotes/quote-config.ts) -- a starting
   * position the send-dialog toggle can still override, not a lock. Null defaults to
   * "international" at resolve time. */
  audience: "international" | "resident" | null
  /** Client-facing name for the {{rateLabel}} token, e.g. "SADC Resident special" for a rate whose
   * internal name is "Rovos Rail SADC". Falls back to `name` when null. */
  clientLabel: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PricingSnapshot {
  source: "pricing_engine"
  pricingMode: "rate_card" | "fixed_package" | "manual"
  packageId: string
  packageName: string
  legId: string | null
  legLabel: string | null
  supplierId: string | null
  supplierName: string | null
  supplierKind: SupplierKind | null
  routeId: string | null
  routeName: string | null
  /** Two-way (round_trip) routes only: true when the booking travels destination → origin. */
  routeReversed?: boolean
  suiteTypeId: string | null
  suiteTypeName: string | null
  rateCardId: string | null
  rateTypeId?: string | null
  rateTypeCode?: string | null
  rateTypeName?: string | null
  /** True when the rate type was inherited (the supplier's quoted or base rate, or the system
   * default) rather than an explicit per-leg choice. Null on lines with no rate card at all
   * (manual-pricing legs). */
  rateTypeInherited?: boolean | null
  travelDate: string
  passengerKind: "adult" | "child" | "infant" | "single_supplement" | "service" | "included"
  baseUnitPrice: number
  markupPct: number
  singleSupplementPct: number | null
  serviceType: "transfer" | "rental" | null
  suiteVariants?: { label: string; values: string[] }[]
  /** The specific bedroom/layout/bathroom actually chosen for this unit (as opposed to
   *  suiteVariants, which lists every option the suite type offers). Absent when the
   *  line covers multiple rooms whose configs weren't confirmed identical. */
  selectedVariants?: { label: string; values: string[] }[]
  markupAmount?: number | null
  /** The supplier's own currency, when it differed from the quote's and this line was converted.
   *  Absent or equal to the quote currency means the price is native — no conversion happened. */
  sourceCurrency?: string | null
  /** The pre-conversion unit price, in sourceCurrency. Kept so the internal provenance note can
   *  show what the supplier actually charges, not just the converted figure. */
  sourceUnitPrice?: number | null
  /** The multiplier applied: unitPrice = roundMoney(sourceUnitPrice * fxRate). Stamped here so a
   *  sent quote never reprices itself when the market moves. */
  fxRate?: number | null
  /** The rate's publication date, so a stale conversion is visible internally. */
  fxRateAsOf?: string | null
  commission?: CommissionBreakdown | null
  /** True when this line was added as an ad-hoc extra (not part of an applied package). */
  isExtra?: boolean
  /** Hotel legs only: the consultant-typed per-room-per-night price that replaced the rate card
   *  for this room, in sourceCurrency (the card's own currency). Internal-only — the client sees
   *  the resulting amount and nothing about the override. */
  manualRoomPrice?: number | null
  /** The rate card price the override replaced, in the same currency. Null when the room had no
   *  valid card at all (an override is allowed to price a room the rate cards don't cover). */
  manualRoomPriceBase?: number | null
  manualRoomPriceSetAt?: string | null
  manualRoomPriceSetByName?: string | null
  /** Hotel legs only: nights of this room's stay the hotel gifted, so the line prices
   *  `stayNights - complimentaryNights`. Today only ever 0 or 1 ("first night complimentary"),
   *  stored as a count so the qty on the line can always be read back against the real stay. */
  complimentaryNights?: number | null
  /** Hotel legs only: the room's full stay length in nights. The line's own qty is the charged
   *  nights, so this is what client documents and the worksheet count the stay by. */
  stayNights?: number | null
  /** Transfer/rental legs only: the consultant-typed price that replaced the rate card for this
   *  request, in sourceCurrency. Internal-only, same posture as manualRoomPrice. */
  manualTransportPrice?: number | null
  /** The rate card price the override replaced, in the same currency. Null when the request had
   *  no valid card at all (an override is allowed to price a trip the rate cards don't cover). */
  manualTransportPriceBase?: number | null
  manualTransportPriceSetAt?: string | null
  manualTransportPriceSetByName?: string | null
  /** Transfer/rental legs only: true when the trip was marked complimentary, forcing the line to
   *  price at 0 independent of manualTransportPrice. See booking_transport_requests.complimentary. */
  isComplimentaryTransport?: boolean | null
  /** Transfer/rental legs only: the booking_transport_requests row this line priced, so the
   *  voucher builder can match a complimentary flag back to the specific captured trip (unlike
   *  hotels, whose complimentary flag is per-leg, transfers are per-request). */
  transportRequestId?: string | null
  /** Transfers only: which pricing basis this specific line priced under. Present on every
   *  transfer line once any transfer supplier has adopted per-person pricing, so a leg mixing a
   *  per-vehicle row (unswitched) and a per-person row (switched, same leg) stays explicable in
   *  the internal quote view. See lib/pricing/transfer-basis.ts. */
  transferPricingBasis?: "per_vehicle" | "per_person" | null
  /** Tour legs only: the consultant-typed flat price that replaced the rate card for this unit,
   *  in sourceCurrency. Internal-only, same posture as manualRoomPrice/manualTransportPrice. */
  manualTourPrice?: number | null
  /** The rate card price the override replaced, in the same currency. Null when the unit had no
   *  valid card at all (an override is allowed to price a tour the rate cards don't cover). */
  manualTourPriceBase?: number | null
  manualTourPriceSetAt?: string | null
  manualTourPriceSetByName?: string | null
  /** Display-only quantity basis shown next to the qty (e.g. "per person", "per room per night"). */
  unit?: string | null
}

export interface SupplierPackage {
  id: string
  slug: string
  name: string
  description: string | null
  durationNights: number | null
  singleSupplementPct: number
  currency: string
  active: boolean
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
}

/**
 * Where a dated service sits relative to the service it hangs off.
 *
 * A hotel anchors to its train leg (`pre` = the night(s) before departure, `post` = from the day
 * the train arrives). A transfer or an airline anchors to the leg above it in the itinerary
 * (`pre` = the day that leg starts, `post` = the day it ends) — skipping past any transport/
 * transfer legs in between. `custom` is a booking-level override only — a package leg stores
 * `pre`/`post`, or null when the service isn't anchored at all.
 */
export type ServiceDateAnchor = "pre" | "post" | "custom"

export interface PackageLeg {
  id: string
  packageId: string
  supplierId: string
  supplierName: string
  supplierDescription: string | null
  supplierKind: SupplierKind
  /** 'manual' suppliers (airlines, by default) skip rate cards entirely -- their price is typed
   *  per unit at quote-build time instead of resolved from a route/suite/date match. */
  pricingMode: "rate_card" | "manual"
  /** Transfers only: this supplier's default pricing basis (flat per vehicle, or split
   * adult/child/infant per person). A booking_transport_requests row's own pricing_basis, once
   * set, always wins over this -- see lib/pricing/transfer-basis.ts resolveTransferPricingBasis.
   * Ignored for every other supplier kind. */
  transferPricingBasis: "per_vehicle" | "per_person"
  label: string | null
  sortOrder: number
  /** Hotel legs only: pre-stay (night(s) before departure) or post-stay (from train arrival). */
  dateAnchor: "pre" | "post" | null
  /**
   * The supplier's baseline rate type (its own, else the system default). The last inherited tier
   * before the system default when picking this leg's rate card.
   */
  baseRateTypeId: string | null
  /**
   * The rate type this supplier's quotes should use, when it differs from the baseline. Tried
   * first, and falls through to the baseline when it has no card for the route/suite/date.
   */
  quoteRateTypeId: string | null
  /** Display name of the rate type a leg with no explicit choice will price at. */
  inheritedRateTypeName: string | null
  /**
   * The rate types this supplier prices at -- its base rate plus the ones on its Applicable Rates
   * card. The per-leg rate picker lists only these. Null means the set was never loaded, so the
   * picker falls back to showing every active rate rather than hiding valid choices.
   */
  applicableRateTypeIds: string[] | null
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
  suiteTypes: SupplierSuiteType[]
}

export interface PackageDetail {
  id: string
  name: string
  slug: string
  description: string | null
  durationNights: number | null
  singleSupplementPct: number
  markupPct?: number
  fixedPricePerPerson: number | null
  currency: string
  active: boolean
  legs: PackageLeg[]
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface SupplierEmail {
  id: string
  supplierId: string
  email: string
  label: string
  createdAt: string
  createdAtDisplay?: string
}

/**
 * A train supplier's boarding/alighting address in one city. A train serves several stations, so
 * the supplier-level `streetAddress` (its head office) can't answer "where does the guest board?" --
 * that depends on the leg's route and its booked direction. One row per (supplier, city); the
 * voucher resolves a leg's boarding point from its route's origin and its arrival point from the
 * destination, swapping the two when `route_reversed` is set.
 */
export interface SupplierStationAddress {
  id: string
  supplierId: string
  /** The city this station serves -- matched against a route's origin/destination location. */
  locationId: string
  /** e.g. "Rovos Rail Station". */
  stationName: string | null
  /** e.g. "Capital Park, Pretoria". */
  streetAddress: string | null
  /** Internal only -- never printed on client documents. */
  notes: string | null
}

export interface Supplier {
  id: string
  slug: string
  kind: SupplierKind
  status: SupplierStatus
  /** 'manual' suppliers (airlines, by default) skip rate cards -- their price is typed per unit
   *  at quote-build time instead. See PackageLeg.pricingMode. */
  pricingMode: "rate_card" | "manual"
  /** Transfers only: default pricing basis for this supplier's newly created transfer rows. See
   * PackageLeg.transferPricingBasis and lib/pricing/transfer-basis.ts. Always 'per_vehicle' for
   * every other supplier kind. */
  transferPricingBasis: "per_vehicle" | "per_person"
  name: string
  email: string | null
  phone: string | null
  website: string | null
  /** Free-text head office city -- train operators only (a train has no single city). Every
   *  other kind resolves its city from `locationId`; see `supplierLocationName`. */
  location: string | null
  locationId: string | null
  locationAreaId: string | null
  description: string | null
  notes: string | null
  active: boolean
  singleSupplementPct: number
  infantMaxAge: number | null
  childMaxAge: number | null
  defaultTimeStart: string | null
  defaultTimeEnd: string | null
  /** Client-facing bullets shown under this supplier's leg in the quote itinerary. Superseded by
   * the tagged rows on SupplierDetail.inclusionLines; kept as an unread fallback for one release. */
  inclusions: string[]
  /** Client-facing exclusions pooled into the quote's "Your Package Excludes" section. Same
   * fallback note as inclusions above. */
  exclusions: string[]
  /** Train operators only: the route.durationDays threshold at/above which a journey on this
   * supplier is "long" rather than "short" (see lib/quotes/quote-config.ts). Null means this
   * supplier has no short/long concept -- every quote's journeyClass resolves null. */
  longJourneyMinDays: number | null
  /** {{trainOnlyNote}} template block, shown only when a quote prices this supplier's train and
   * nothing else. */
  trainOnlyNote: string | null
  /** Train operators only: how much suite detail the quote itinerary sentence states.
   * 'type_only' (default) reads "in a Deluxe Suite"; 'full' states the whole configuration, e.g.
   * "in a Double bedded Deluxe Suite with a shower, Lengthways". The voucher's Suite Type row,
   * invoice view and worksheet always state the full configuration regardless of this setting. */
  quoteSuiteDetail: "type_only" | "full"
  /** Printed under this supplier's heading on the voucher, alongside phone/location. */
  streetAddress: string | null
  emergencyPhone: string | null
  /** Default named contact for this supplier's vouchers (e.g. "Carla") -- prefills a leg's own
   * supplierContactName at capture time, which can then be overridden per booking. */
  defaultContactName: string | null
  /**
   * Set when this record inherits its contact details from a sibling record for the same company
   * in a different category -- e.g. "Toyota (Transfers)" reusing "Toyota (Hotel)"'s phone, website
   * and email list. Non-null *is* the "Linked" checkbox; there is no separate boolean.
   *
   * The inherited values are physically mirrored onto this row by database triggers, so every
   * reader (vouchers, backups) sees real values. Only the editor treats them as read-only.
   */
  parentSupplierId: string | null
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

/**
 * A rate type that applies to a supplier, with how much cheaper it is than the
 * supplier's default rate. `discountPct` is the percentage off the default rate
 * (e.g. 20 => default price * 0.8).
 */
export interface SupplierRateAdjustment {
  rateTypeId: string
  discountPct: number
}

/**
 * One row of a supplier's tagged inclusion/exclusion list (see
 * lib/inclusions/filter-lines.ts). journeyTag/rateTag null means the row shows
 * regardless of the quote's resolved journey class / rate audience; an item
 * with no tag of its own inherits the nearest preceding heading's tag.
 */
export interface SupplierInclusionLine {
  id: string
  list: "inclusions" | "exclusions"
  kind: "heading" | "item"
  text: string
  journeyTag: "short" | "long" | null
  rateTag: "international" | "resident" | null
  sortOrder: number
}

export interface SupplierDetail extends Supplier {
  /** Populated alongside `parentSupplierId` so the editor can say "Inherited from Toyota (Hotel)"
   * and link through to it, without a second round trip. */
  parentSupplierName: string | null
  parentSupplierKind: SupplierKind | null
  parentSupplierSlug: string | null
  emails: SupplierEmail[]
  suiteTypes: SupplierSuiteType[]
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
  /** Per-city station addresses -- only train operators use these today. */
  stationAddresses: SupplierStationAddress[]
  locations: Location[]
  bedroomTypes: SupplierVariantValue[]
  bedroomLayouts: SupplierVariantValue[]
  bathroomTypes: SupplierVariantValue[]
  /**
   * Learned phrase -> vocabulary mappings for this supplier. Lets client code run the same pure
   * suite resolver the server uses, so both agree by construction. See lib/suites/.
   */
  suiteAliases: SupplierSuiteAlias[]
  /** Tagged inclusion/exclusion rows -- the structured replacement for the flat `inclusions` /
   * `exclusions` arrays above, which stay populated for one release as an unread fallback. */
  inclusionLines: SupplierInclusionLine[]
  rateTypes: RateType[]
  /** Non-default rates that apply to this supplier and their markdown. */
  rateAdjustments: SupplierRateAdjustment[]
  /**
   * This supplier's base rate -- its own starting price, and the baseline every rateAdjustment is
   * measured against. Falls back to the global default rate type when the supplier has none.
   */
  baseRateTypeId: string | null
  /**
   * The rate type this supplier's quotes price at, when it differs from the base rate. Null means
   * "quote at the base rate", so a supplier that has never nominated one is unaffected.
   */
  quoteRateTypeId: string | null
}

export interface BookingTransportRequest {
  id: string
  bookingId: string
  serviceType: TransportRequestServiceType
  supplierId: string | null
  routeId: string | null
  suiteTypeId: string | null
  /** The booking_services row this trip belongs to, or null for a manually-added trip. */
  serviceId: string | null
  pickupPoint: string
  dropoffPoint: string
  pickupAt: string | null
  pickupAtDisplay?: string
  /** Transfers only: `pre`/`post` derive the pickup DATE from the leg above it in the itinerary;
   *  `custom` (the default) leaves it hand-picked. Always null on a rental. */
  dateAnchor: ServiceDateAnchor | null
  rentalDetails: BookingVehicleRentalDetails | null
  passengerCount: number | null
  luggageCount: number | null
  flightNumber: string | null
  /** When set, the quote line for this request uses this price instead of the rate card. */
  priceOverride: number | null
  /** When priceOverride was last set, server-stamped. Null when there is no override. */
  priceOverrideSetAt: string | null
  /** When true this trip is not charged, independent of priceOverride. Mirrors
   *  booking_service_units.complimentary_first_night for hotels. */
  complimentary: boolean
  notes: string | null
  supplierReference: string | null
  /** Transfers only, always 'per_vehicle' for a rental. Row-level override of the supplier's
   * transferPricingBasis default — see lib/pricing/transfer-basis.ts. Once set on a saved row,
   * this is never re-derived from the supplier, so flipping the supplier later never re-prices
   * an existing transfer. */
  pricingBasis: "per_vehicle" | "per_person"
  /** Per-person mode only. Null means "use the booking's projected totals" — see
   * lib/pricing/transfer-basis.ts resolveTransferPax. Any one of the three being set means the
   * other two default to 0, not to the booking totals. */
  adultCount: number | null
  childCount: number | null
  infantCount: number | null
  /** Per-person mode only. Mirror of priceOverride for the child/infant fares — priceOverride
   * itself is the adult override in that mode. Each falls back to its own rate-card value when
   * null. */
  priceOverrideChild: number | null
  priceOverrideInfant: number | null
  sortOrder: number
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface BookingVehicleRentalDetails {
  transportRequestId: string
  returnAt: string | null
  returnAtDisplay?: string
  returnCutoffTime: string | null
  createdAt: string
  updatedAt: string
}

// Legacy alias — kept so existing components that reference Job still compile
export interface Job {
  id: string
  jobNumber: string
  ownerUser: string
  ownerUserId?: string | null
  ownerName?: string | null
  assignedSalespersonId?: string | null
  assignedSalespersonName?: string | null
  customerId: string
  consultant: ConsultantAbbreviation
  purpose: Purpose
  source: Source
  stage: PipelineStage
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
  depositPaid?: boolean | null
  invoiceBalance?: number | null
  overpaidAmount?: number | null
  customerInvoiceNumber?: string | null
  cancelReason?: string | null
  cancelledAt?: string | null
  cancelledAtDisplay?: string
  outcome?: Outcome
  isRepeatClientAtCreation?: boolean
}

export interface Enquiry {
  id: string
  jobId: string
  source: Source
  purpose: Purpose
  rawText?: string
  extractedJson?: Record<string, unknown>
  emailImportNeedsReview?: boolean
  emailImportMissingFields?: string[]
  emailImportWarnings?: string[]
  emailImportDuplicateOfBookingId?: string | null
  emailImportSubject?: string | null
  emailImportMailbox?: string | null
  emailImportReceivedAt?: string | null
  emailImportReceivedAtDisplay?: string
  emailImportRawPreview?: string | null
  title: string
  name: string
  surname: string
  contactNumber: string
  email: string
  confirmEmail?: string
  country: string
  direction: string
  /** False when `direction` is the customer's raw wording, not a route the system could resolve. */
  directionResolved?: boolean
  /** Train operator name, resolved if possible, otherwise the raw wording the customer used. */
  supplier?: string
  supplierResolved?: boolean
  departureDate: string
  departureDateDisplay?: string
  noOfSuites: number
  noOfAdults: number
  noOfChildren: number
  noOfAdultsOriginal?: number
  noOfChildrenOriginal?: number
  childAges?: number[]
  suiteTypes: string[]
  travellers?: Traveller[]
  childTravellers?: Traveller[]
  hotelBooking?: string
  hotelOption?: string
  hotelOptionResolved?: boolean
  hotelPhase?: "pre" | "post" | "none"
  packageOption?: string
  extendStay?: string
  extraNights?: number
  additionalServices?: string
  additionalServicesDetails?: string
  promotionCode?: string
  transportRequests?: BookingTransportRequest[]
  termsAccepted: boolean
  createdAt: string
  createdAtDisplay?: string
}

export interface Traveller {
  prefix: string
  name: string
  surname: string
  idPassport: string
  dateOfBirth: string
  dateOfBirthDisplay?: string
}

export interface Itinerary {
  id: string
  jobId: string
  name: string
  notes: string
  acceptedAt?: string
  acceptedAtDisplay?: string
}

export type QuoteStatus =
  | "draft"
  | "pricing_incomplete"
  | "ready"
  | "sent"
  | "accepted"
  | "expired"
  | "superseded"
  | "cancelled"

export interface QuoteLineItem {
  description: string
  supplierDescription?: string | null
  qty: number
  status?: string | null
  unitPrice: number
  total: number
  pricingSnapshot?: PricingSnapshot | null
}

export interface Quote {
  id: string
  itineraryId: string
  jobId: string
  status: QuoteStatus
  quoteNumber?: string | null
  parentQuoteId?: string | null
  validityUntil: string
  validityUntilDisplay?: string
  updatedAt?: string
  updatedAtDisplay?: string
  lineItems: QuoteLineItem[]
  subtotal: number
  total: number
  /** The single currency this quote — every line, the subtotal and the total — is denominated in.
   *  Foreign supplier rates are converted into it when the quote is priced. */
  currency: string
  /** Flat manual amount folded into the Commission line. Already included in subtotal/total. */
  commissionBonus?: number
  lastSentAt?: string
  lastSentAtDisplay?: string
  overridePin?: string
  overrideReason?: string
  title?: string | null
  amountReceived?: number | null
  outstandingAmount?: number | null
  pdfDocumentId?: string | null
}

export interface Payment {
  id: string
  jobId: string
  invoiceId?: string | null
  amount: number
  paymentKind?: "capture" | "refund"
  paymentDate?: string
  receivedAt: string
  receivedAtDisplay?: string
  method: string
  reference: string
  notes: string
  proofStoragePath?: string | null
}

export type InvoiceKind = "deposit" | "final" | "full"
export type InvoiceStatus = "draft" | "sent" | "paid" | "void"

export interface Invoice {
  id: string
  jobId: string
  quoteId: string | null
  kind: InvoiceKind
  status: InvoiceStatus
  invoiceNumber: string
  depositPercentage: number | null
  amount: number
  amountDisplay?: string
  currency: string
  dueDate: string | null
  dueDateDisplay?: string
  sentAt: string | null
  sentAtDisplay?: string
  createdAt: string
  createdAtDisplay?: string
}

export type DocumentKind =
  | "quote_pdf"
  | "invoice_pdf"
  | "voucher_pdf"
  | "itinerary_pdf"
  | "summary_pdf"
  | "proof_of_payment"
  | "other"

export interface DocRecord {
  id: string
  jobId: string
  kind: DocumentKind
  status?: "required" | "received" | "generated" | "sent"
  fileName?: string | null
  uploadedBy?: string | null
  uploadedByName?: string | null
  paymentId?: string | null
  generatedAt: string
  generatedAtDisplay?: string
  urlOrBlobRef: string
}

export interface BookingNote {
  id: string
  bookingId: string
  authorId: string | null
  authorName: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface Template {
  id: string
  key: string
  name: string
  subject: string
  bodyHtml: string
  version: number
  active: boolean
  isSystem: boolean
  sortOrder: number
  /** Set only on a per-train variant of a system key (e.g. a Rovos-specific quote_email body) --
   * null on every other template, including the shared/default row for that same key. */
  supplierId: string | null
}

export interface Correspondence {
  id: string
  jobId: string
  channel: "email"
  kind?: string | null
  subject: string
  bodyHtml: string
  status: "sent" | "failed" | "scheduled"
  sentAt?: string
  sentAtDisplay?: string
  scheduledAt?: string
  scheduledAtDisplay?: string
  error?: string
  providerMessageId?: string | null
}

export interface AuditLog {
  id: string
  actor: string
  actorUserId?: string
  actorDisplayName?: string
  entityType: string
  entityId: string
  entityDisplayLabel?: string
  action: string
  beforeJson?: string
  afterJson?: string
  metaJson?: string
  /** Set on `stage_change_override`: the reason the manager typed. */
  overrideReason?: string
  /** Set on `stage_change_override`: the manager's user id. */
  overriddenBy?: string
  createdAt: string
  createdAtDisplay?: string
}

export interface RateCard {
  direction: string
  suiteType: string
  pricePerPerson: number
  currency: string
}

export interface PipelineHistory {
  id: string
  jobId: string
  fromStage: PipelineStage
  toStage: PipelineStage
  movedBy: string
  movedAt: string
  movedAtDisplay?: string
}

export type VoucherSectionKey = "guest_info" | "service_provider" | "footer"

export interface VoucherTemplate {
  id?: string
  header_text: string
  product_line: string
  accent_colour: string
  section_bg: string
  font_family: string
  section_order: VoucherSectionKey[]
  hidden_sections: VoucherSectionKey[]
  footer_company: string
  footer_phone: string
  footer_email: string
  guidance_text: string
}

export interface SalespersonCredential {
  id: string
  profile_id: string
  email_address: string
  smtp_host: string
  smtp_port: number
  smtp_encryption: string
  imap_host: string
  imap_port: number
  imap_encryption: string
  imap_sent_folder: string
  encrypted_password: string | null
  created_at: string
  updated_at: string
}

export interface BackupRecord {
  id: string
  storage_path: string
  size_bytes: number | null
  created_at: string
  created_by: string | null
  retained_until: string | null
}

export const VOUCHER_TEMPLATE_DEFAULTS: VoucherTemplate = {
  header_text: "A division of Luxus Travel & Tours",
  product_line: "THE BLUE TRAIN • ROVOS RAIL • KRUGER SHALATI",
  accent_colour: "#0B2A3A",
  section_bg: "#1a3a4a",
  font_family: "Arial, sans-serif",
  section_order: ["guest_info", "service_provider", "footer"],
  hidden_sections: [],
  footer_company: "Luxus Travel & Tours",
  footer_phone: "",
  footer_email: "",
  guidance_text:
    "Please hand to your service provider. Pre-payment was made by Luxus Travel & Tours for all services mentioned below. Guests must settle extras direct with the service providers.",
}
