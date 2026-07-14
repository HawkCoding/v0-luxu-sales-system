export type Role = "admin" | "manager" | "consultant" | "readonly"

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
  country: string | null
  province?: string | null
  title?: string | null
  notes?: string | null
  dateOfBirth?: string | null
  vipStatus?: boolean
  preferences?: string | null
  communicationPreferences?: string | null
  defaultRateTypeId?: string | null
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
  depositRequestedAt: string | null
  depositPaidAt: string | null
  finalPaidAt: string | null
  voucherSentAt: string | null
  closedAt: string | null
  depositPaid: boolean
  invoiceBalance: number | null
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

export const CURRENCIES: { value: string; label: string }[] = [
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "AUD", label: "AUD — Australian Dollar" },
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
    routeNameAutoDerived: false,
    showSingleSupplement: true,
    showDurationNights: true,
    originLabel: "Origin",
    destinationLabel: "Destination",
    durationLabel: "days",
  },

  airline: {
    suiteType: "Cabin",
    suiteTypePlural: "Cabins",
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

export type CommissionKind = "percent" | "per_person"

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
  amount: number
  source: CommissionSource
}

export interface SupplierRoute {
  id: string
  supplierId: string
  name: string
  originLocationId: string | null
  destinationLocationId: string | null
  pickupPoint?: string | null
  dropoffPoint?: string | null
  vehicleRentalDetails?: VehicleRentalRouteDetails | null
  directionMode?: RouteDirectionMode
  /** Trip length in whole days; train routes only, null otherwise. */
  durationDays?: number | null
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
  routeId: string
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
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Per-supplier-kind default rate type. Decides which rate a supplier (and its
 * rate matrix) starts on. Falls back to the global default rate type when a
 * kind has no explicit mapping.
 */
export interface SupplierKindDefaultRateType {
  kind: SupplierKind
  rateTypeId: string
}

export interface PricingSnapshot {
  source: "pricing_engine"
  pricingMode: "rate_card" | "fixed_package"
  packageId: string
  packageName: string
  legId: string | null
  legLabel: string | null
  supplierId: string | null
  supplierName: string | null
  supplierKind: SupplierKind | null
  routeId: string | null
  routeName: string | null
  suiteTypeId: string | null
  suiteTypeName: string | null
  rateCardId: string | null
  rateTypeId?: string | null
  rateTypeCode?: string | null
  rateTypeName?: string | null
  travelDate: string
  passengerKind: "adult" | "child" | "infant" | "single_supplement" | "service" | "included"
  baseUnitPrice: number
  markupPct: number
  singleSupplementPct: number | null
  serviceType: "transfer" | "rental" | null
  suiteVariants?: { label: string; values: string[] }[]
  markupAmount?: number | null
  commission?: CommissionBreakdown | null
  /** True when this line was added as an ad-hoc extra (not part of an applied package). */
  isExtra?: boolean
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

/** Where a hotel stay sits relative to its train leg. `custom` is a booking-level override only —
 * a package leg stores `pre`/`post` (or null when the hotel isn't anchored to the train at all). */
export type HotelDateAnchor = "pre" | "post" | "custom"

export interface PackageLeg {
  id: string
  packageId: string
  supplierId: string
  supplierName: string
  supplierDescription: string | null
  supplierKind: SupplierKind
  label: string | null
  sortOrder: number
  /** Hotel legs only: pre-stay (night(s) before departure) or post-stay (from train arrival). */
  dateAnchor: "pre" | "post" | null
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

export interface Package {
  id: string
  name: string
  slug: string
  description: string | null
  durationNights: number | null
  currency: string
  active: boolean
  legCount: number
  supplierKinds: SupplierKind[]
  priceFrom: number | null
  priceTo: number | null
  trainRouteName: string | null
  fixedPricePerPerson: number | null
  markupPct?: number
}

export interface SupplierEmail {
  id: string
  supplierId: string
  email: string
  label: string
  createdAt: string
  createdAtDisplay?: string
}

export interface Supplier {
  id: string
  slug: string
  kind: SupplierKind
  status: SupplierStatus
  name: string
  email: string | null
  phone: string | null
  website: string | null
  location: string | null
  locationDetail: string | null
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

export interface SupplierDetail extends Supplier {
  emails: SupplierEmail[]
  suiteTypes: SupplierSuiteType[]
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
  locations: Location[]
  bedroomTypes: SupplierVariantValue[]
  bedroomLayouts: SupplierVariantValue[]
  bathroomTypes: SupplierVariantValue[]
  rateTypes: RateType[]
  /** Non-default rates that apply to this supplier and their markdown. */
  rateAdjustments: SupplierRateAdjustment[]
  /** Resolved default rate type for this supplier's kind (the baseline). */
  defaultRateTypeId: string | null
}

export interface BookingTransportRequest {
  id: string
  bookingId: string
  serviceType: TransportRequestServiceType
  supplierId: string | null
  routeId: string | null
  suiteTypeId: string | null
  packageLegId: string | null
  pickupPoint: string
  dropoffPoint: string
  pickupAt: string | null
  pickupAtDisplay?: string
  rentalDetails: BookingVehicleRentalDetails | null
  passengerCount: number | null
  luggageCount: number | null
  flightNumber: string | null
  notes: string | null
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

export type BookingScheduleSupplierKind = "hotel_property" | "train_operator" | "vehicle_rental"

export interface BookingSupplierSchedule {
  id: string
  bookingId: string
  supplierId: string | null
  supplierKind: BookingScheduleSupplierKind
  label: string | null
  dateFrom: string
  dateFromDisplay?: string
  dateTo: string
  dateToDisplay?: string
  timeStart: string | null
  timeEnd: string | null
  notes: string | null
  sortOrder: number
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
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
  departureDate: string
  departureDateDisplay?: string
  noOfSuites: number
  noOfAdults: number
  noOfChildren: number
  childAges?: number[]
  suiteTypes: string[]
  travellers?: Traveller[]
  childTravellers?: Traveller[]
  hotelBooking?: string
  hotelOption?: string
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
  vat: number
  total: number
  lastSentAt?: string
  lastSentAtDisplay?: string
  overridePin?: string
  overrideReason?: string
  noPackageMatch?: boolean
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

export type InvoiceKind = "deposit" | "final"
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
  subject: string
  bodyHtml: string
  version: number
  active: boolean
  isSystem: boolean
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
  logo_url: string | null
  banner_url: string | null
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
  logo_url: null,
  banner_url: null,
  header_text: "A division of Luxus Travel & Tours",
  product_line: "THE BLUE TRAIN • ROVOS RAIL • KRUGER SHALATI",
  accent_colour: "#0B2A3A",
  section_bg: "#1a3a4a",
  font_family: "Georgia, serif",
  section_order: ["guest_info", "service_provider", "footer"],
  hidden_sections: [],
  footer_company: "Luxus Travel & Tours",
  footer_phone: "",
  footer_email: "",
  guidance_text:
    "Please hand to your service provider. Pre-payment was made by Luxus Travel & Tours for all services mentioned below. Guests must settle extras direct with the service providers.",
}
