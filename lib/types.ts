export type Role = "admin" | "manager" | "consultant" | "readonly"

export type Purpose = "quote" | "availability" | "reservation"
export type Source = "web_form" | "paste_import"

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
  | "deposit_requested"
  | "deposit_paid"
  | "final_paid"
  | "voucher_sent"
  | "closed"
  | "lost"

export const PIPELINE_STAGES: { key: PipelineStage; label: string }[] = [
  { key: "enquiry", label: "Enquiry" },
  { key: "quoted", label: "Quoted" },
  { key: "quote_sent", label: "Quoted" }, // Merged with "quoted" for display
  { key: "accepted", label: "Reservation" },
  { key: "deposit_requested", label: "Waiting on Deposit" },
  { key: "deposit_paid", label: "Deposit Paid" },
  { key: "final_paid", label: "Final Paid" },
  { key: "voucher_sent", label: "Voucher Sent" },
  { key: "closed", label: "Closed/Won" },
  { key: "lost", label: "Lost" },
]

// Kanban board stages - merges quoted and quote_sent into one column
export const KANBAN_STAGES: { key: PipelineStage | "quoted_combined"; label: string; includes: PipelineStage[] }[] = [
  { key: "enquiry", label: "Enquiry", includes: ["enquiry"] },
  { key: "quoted_combined", label: "Quoted", includes: ["quoted", "quote_sent"] },
  { key: "accepted", label: "Reservation", includes: ["accepted"] },
  { key: "deposit_requested", label: "Waiting on Deposit", includes: ["deposit_requested"] },
  { key: "deposit_paid", label: "Deposit Paid", includes: ["deposit_paid"] },
  { key: "final_paid", label: "Final Paid", includes: ["final_paid"] },
  { key: "voucher_sent", label: "Voucher Sent", includes: ["voucher_sent"] },
  { key: "closed", label: "Closed/Won", includes: ["closed"] },
  { key: "lost", label: "Lost", includes: ["lost"] },
]

export interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  country: string | null
  title?: string | null
  createdAt: string
  updatedAt?: string
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
  durationNights: number | null
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
  updatedAt: string
}

export type SupplierKind = "train_operator" | "hotel_property" | "transfers"

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  train_operator: "Train",
  hotel_property: "Hotel",
  transfers: "Transfers",
}

export interface SupplierPricingOption {
  id: string
  supplierId: string
  name: string
  singlePrice: number
  doublePrice: number
  familyPrice: number
  currency: string
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: string
  kind: SupplierKind
  name: string
  email: string | null
  phone: string | null
  website: string | null
  location: string | null
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface SupplierDetail extends Supplier {
  pricingOptions: SupplierPricingOption[]
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
  updatedAt: string
}

export interface Enquiry {
  id: string
  jobId: string
  source: Source
  purpose: Purpose
  rawText?: string
  extractedJson?: Record<string, unknown>
  title: string
  name: string
  surname: string
  contactNumber: string
  email: string
  confirmEmail?: string
  country: string
  direction: string
  departureDate: string
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
}

export interface Traveller {
  prefix: string
  name: string
  surname: string
  idPassport: string
  dateOfBirth: string
}

export interface Itinerary {
  id: string
  jobId: string
  name: string
  notes: string
  acceptedAt?: string
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
  lineItems: QuoteLineItem[]
  subtotal: number
  vat: number
  total: number
  lastSentAt?: string
  overridePin?: string
  overrideReason?: string
}

export interface Payment {
  id: string
  jobId: string
  amount: number
  receivedAt: string
  method: string
  reference: string
  notes: string
}

export type DocumentKind = "quote_pdf" | "voucher_pdf"

export interface DocRecord {
  id: string
  jobId: string
  kind: DocumentKind
  generatedAt: string
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
  subject: string
  bodyHtml: string
  status: "sent" | "failed" | "scheduled"
  sentAt?: string
  scheduledAt?: string
  error?: string
}

export interface AuditLog {
  id: string
  actor: string
  entityType: string
  entityId: string
  action: string
  beforeJson?: string
  afterJson?: string
  metaJson?: string
  createdAt: string
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
}
