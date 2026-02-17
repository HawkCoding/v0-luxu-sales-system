export type Role = "admin" | "manager" | "consultant" | "readonly"

export type Purpose = "quote" | "availability" | "reservation"
export type Source = "web_form" | "paste_import"

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
  { key: "quote_sent", label: "Quote Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "deposit_requested", label: "Deposit Req." },
  { key: "deposit_paid", label: "Deposit Paid" },
  { key: "final_paid", label: "Final Paid" },
  { key: "voucher_sent", label: "Voucher Sent" },
  { key: "closed", label: "Closed" },
  { key: "lost", label: "Lost" },
]

export interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  createdAt: string
}

export interface Job {
  id: string
  jobNumber: string
  ownerUser: string
  customerId: string
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
