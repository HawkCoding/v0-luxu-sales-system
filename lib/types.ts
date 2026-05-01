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
  title?: string | null
  notes?: string | null
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
  cancelReason: string | null
  cancelledAt: string | null
  cancelledAtDisplay?: string
  refundStatus: "refunded" | "not_refunded" | null
  refundAmount: number | null
  refundReference: string | null
  refundedAt: string | null
}

export const CANCEL_REASONS = [
  "Client cancelled",
  "No availability",
  "Price or payment concern",
  "Duplicate request",
  "Created by mistake",
  "Other",
] as const

export type CancelReason = (typeof CANCEL_REASONS)[number]

export type SupplierKind =
  | "train_operator"
  | "hotel_property"
  | "transfers"
  | "tour_operator"
  | "airline"
export type SupplierStatus = "draft" | "active" | "inactive"

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
  showSingleSupplement: boolean
  showDurationNights: boolean
  originLabel: string
  destinationLabel: string
  durationLabel: string
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
  showSingleSupplement: true,
  showDurationNights: true,
  originLabel: "Origin",
  destinationLabel: "Destination",
  durationLabel: "nights",
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
    showSingleSupplement: false,
    showDurationNights: false,
    originLabel: "Origin",
    destinationLabel: "Destination",
    durationLabel: "nights",
  },

  transfers: {
    suiteType: "Vehicle Type",
    suiteTypePlural: "Vehicle Types",
    package: "Service",
    packagePlural: "Services",
    route: "Route",
    routePlural: "Routes",
    sectionTitle: "Vehicle Types, Routes and Rates",
    sectionDescription:
      "Manage the transfers this supplier offers, routes covered, vehicle types, and period-based rates.",
    priceLabel: "flat per transfer",
    routeHasLocations: true,
    showSingleSupplement: false,
    showDurationNights: false,
    originLabel: "Pickup",
    destinationLabel: "Drop-off",
    durationLabel: "nights",
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

export interface Location {
  id: string
  name: string
  country: string
  regionCode: string | null
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface SupplierRoute {
  id: string
  supplierId: string
  name: string
  originLocationId: string
  destinationLocationId: string
  active: boolean
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface SupplierSuiteType {
  id: string
  supplierId: string
  name: string
  active: boolean
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface SupplierRateCard {
  id: string
  routeId: string
  suiteTypeId: string
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

export interface PackageLeg {
  id: string
  packageId: string
  supplierId: string
  supplierName: string
  supplierKind: SupplierKind
  label: string | null
  sortOrder: number
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
  locationId: string | null
  notes: string | null
  active: boolean
  singleSupplementPct: number
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
}

export interface SupplierDetail extends Supplier {
  emails: SupplierEmail[]
  suiteTypes: SupplierSuiteType[]
  routes: SupplierRoute[]
  rateCards: SupplierRateCard[]
  locations: Location[]
}

// Legacy alias — kept so existing components that reference Job still compile
export interface Job {
  id: string
  jobNumber: string
  ownerUser: string
  customerId: string
  consultant: ConsultantAbbreviation
  purpose: Purpose
  source: Source
  stage: PipelineStage
  createdAt: string
  createdAtDisplay?: string
  updatedAt: string
  updatedAtDisplay?: string
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

export type QuoteStatus = "draft" | "pricing_incomplete" | "ready" | "sent" | "accepted"

export interface QuoteLineItem {
  description: string
  qty: number
  unitPrice: number
  total: number
}

export interface Quote {
  id: string
  itineraryId: string
  jobId: string
  status: QuoteStatus
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
}

export interface Payment {
  id: string
  jobId: string
  amount: number
  receivedAt: string
  receivedAtDisplay?: string
  method: string
  reference: string
  notes: string
}

export type DocumentKind = "quote_pdf" | "invoice_pdf" | "voucher_pdf" | "summary_pdf" | "other"

export interface DocRecord {
  id: string
  jobId: string
  kind: DocumentKind
  status?: "required" | "received" | "generated" | "sent"
  generatedAt: string
  generatedAtDisplay?: string
  urlOrBlobRef: string
}

export interface Template {
  id: string
  key: string
  subject: string
  bodyHtml: string
  version: number
  active: boolean
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
