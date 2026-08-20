"use client"

import useSWR from "swr"
import type {
  AuditLog,
  Booking,
  BookingNote,
  BookingSupplierSchedule,
  Customer,
  CustomerLinkedAccount,
  Location,
  RateType,
  Supplier,
  SupplierDetail,
  VoucherTemplate,
} from "@/lib/types"

type ApiError = Error & { status?: number }

export interface SupplierEmailLabel {
  id: string
  name: string
  sortOrder: number
}

export interface AuditLogListResponse {
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
  retentionMonths: number
  cutoffDate: string
  scope: "active" | "archive"
}

export interface AuditLogFilters {
  scope?: "active" | "archive"
  page?: number
  pageSize?: number
  from?: string
  to?: string
  entityType?: string
  entityId?: string
  search?: string
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  const body = isJson ? await response.json() : null

  if (!response.ok) {
    const error = new Error(
      typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
        : response.statusText || "Request failed"
    ) as ApiError
    error.status = response.status
    throw error
  }

  return body
}

const swrOptions = {
  // Phase 5.4 originally enabled focus revalidation here, but it raced the
  // Supabase session refresh under Playwright (the 03-customer spec hit 403s
  // on customer PATCH because focus events fired during navigation). Holding
  // off until we have a session-refresh-safe story. focusThrottleInterval
  // and dedupingInterval are still useful for hot endpoints.
  revalidateOnFocus: false,
  focusThrottleInterval: 30_000,
  dedupingInterval: 2_000,
  onErrorRetry: (
    error: ApiError,
    _key: string,
    _config: unknown,
    revalidate: (options?: { retryCount?: number }) => void,
    context: { retryCount: number },
  ) => {
    if (error.status === 401) return
    if (context.retryCount >= 3) return

    setTimeout(() => {
      revalidate({ retryCount: context.retryCount + 1 })
    }, 3000)
  },
}

export type DataEntity =
  | "settings"
  | "customers"
  | "bookings"
  | "bookingSuites"
  | "payments"
  | "quotes"
  | "itineraries"
  | "documents"
  | "correspondences"
  | "auditLogs"
  | "pipelineHistory"
  | "templates"

// Scoped replacement for the removed useAllData(): pages declare exactly which
// entities they render and /api/data only queries those tables.
export function useData(entities: readonly DataEntity[]) {
  const key = `/api/data?include=${[...entities].sort().join(",")}`
  return useSWR(key, fetcher, swrOptions)
}

export type EnquiryFilter =
  | "needs_review"
  | "complete"
  | "unassigned"
  | "my_enquiries"
  | "possible_duplicates"

export interface EnquiryCustomer {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  title: string | null
}

export interface EnquiryListItem extends Booking {
  customer: EnquiryCustomer | null
}

export function useEnquiries(filter?: EnquiryFilter | string) {
  const url = filter ? `/api/enquiries?filter=${encodeURIComponent(filter)}` : "/api/enquiries"
  return useSWR<{ enquiries: EnquiryListItem[] }>(url, fetcher, swrOptions)
}

// Lightweight open-enquiry total for the sidebar badge — avoids pulling the
// full dataset into the app shell.
export function useEnquiryCount() {
  return useSWR<{ count: number }>("/api/enquiries?count=true", fetcher, swrOptions)
}

export function useAuditLogs(filters: AuditLogFilters) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== "all") {
      params.set(key, String(value))
    }
  })

  return useSWR<AuditLogListResponse>(`/api/audit?${params.toString()}`, fetcher, swrOptions)
}

export function usePipeline() {
  return useSWR("/api/pipeline", fetcher, swrOptions)
}

export function useJobDetail(id: string) {
  return useSWR(id ? `/api/jobs/${id}` : null, fetcher, swrOptions)
}

export function useBookingNotes(bookingId: string | null | undefined) {
  return useSWR<{ notes: BookingNote[] }>(
    bookingId ? `/api/bookings/${bookingId}/notes` : null,
    fetcher,
    swrOptions,
  )
}

export function useBookingSupplierSchedules(bookingId: string | null | undefined) {
  return useSWR<BookingSupplierSchedule[]>(
    bookingId ? `/api/jobs/${bookingId}/supplier-schedules` : null,
    fetcher,
    swrOptions,
  )
}

export interface JobTraveller {
  id: string
  prefix: string
  firstName: string
  lastName: string
  idPassport: string
  dateOfBirth: string
  residence: string
  roomWith: string
  roomType: string
  isChild: boolean
  isPrimary: boolean
  sortOrder: number
}

/** Booking pax vs. the captured roster — see lib/packages/roster-pax.ts. Null while the booking
 * is still loading; `roster` is null until at least one guest has been captured. */
export interface JobPaxComparison {
  matches: boolean
  roster: { adultCount: number; childCount: number; infantCount: number; total: number; undatedCount: number } | null
  booking: { adultCount: number; childCount: number; infantCount: number; total: number }
  referenceDate: string
}

export function useJobTravellers(bookingId: string | null | undefined) {
  return useSWR<{ travellers: JobTraveller[]; paxComparison: JobPaxComparison | null }>(
    bookingId ? `/api/jobs/${bookingId}/travellers` : null,
    fetcher,
    swrOptions,
  )
}

export interface JobReservationDetails {
  dietary: string
  medical: string
  occasion: string
  smokingPreference: "smoking" | "non_smoking" | null
  mealSeating: "first" | "second" | null
  voucherSpecialRequests: string
  agencyName: string
  agencyAddress: string
  billingCompanyName: string
  billingVatNumber: string
  billingAddressLine1: string
  billingAddressLine2: string
  billingCity: string
  billingProvince: string
  billingPostalCode: string
  billingCountry: string
  updatedAt: string | null
}

export function useJobReservationDetails(bookingId: string | null | undefined) {
  return useSWR<JobReservationDetails>(
    bookingId ? `/api/jobs/${bookingId}/reservation-details` : null,
    fetcher,
    swrOptions,
  )
}

export interface JobLegReferenceRow {
  key: string
  kind: "service" | "transport_request"
  id: string
  label: string
  supplierName: string | null
  supplierReference: string | null
  supplierContactName: string | null
  voucherFootnote: string | null
  excursions: string[]
}

export function useJobLegReferences(bookingId: string | null | undefined) {
  return useSWR<{ rows: JobLegReferenceRow[] }>(
    bookingId ? `/api/jobs/${bookingId}/leg-references` : null,
    fetcher,
    swrOptions,
  )
}

export interface JobMovementTimeRow {
  key: string
  kind: "service" | "transport_request"
  movementType: "flight" | "transfer" | "rental"
  id: string
  label: string
  supplierName: string | null
  departureDate: string | null
  departureTime: string | null
  arrivalDate: string | null
  arrivalTime: string | null
  flightNumber: string | null
  departureAirportCode: string | null
  arrivalAirportCode: string | null
  hasArrival: boolean
  hasFlightIdentity: boolean
  updatedAt: string | null
}

export interface JobMovementTimesResponse {
  rows: JobMovementTimeRow[]
  voucher: { generatedAt: string | null; sentAt: string | null; stale: boolean }
}

export function useJobMovementTimes(bookingId: string | null | undefined) {
  return useSWR<JobMovementTimesResponse>(
    bookingId ? `/api/jobs/${bookingId}/movement-times` : null,
    fetcher,
    swrOptions,
  )
}

export function useTemplates() {
  return useSWR("/api/templates", fetcher, swrOptions)
}

export interface AssignableUser {
  userId: string
  name: string
  clearanceLevel: string
}

export function useAssignableUsers(enabled = true) {
  return useSWR<{ users: AssignableUser[] }>(
    enabled ? "/api/users/assignable" : null,
    fetcher,
    swrOptions,
  )
}

export function useSuppliers() {
  return useSWR<Supplier[]>("/api/suppliers?includeDrafts=true", fetcher, swrOptions)
}

export function useActiveSuppliers() {
  return useSWR<Supplier[]>("/api/suppliers", fetcher, swrOptions)
}

export function useSupplierDetail(slug: string) {
  return useSWR<SupplierDetail | { error: string }>(
    slug ? `/api/suppliers/${slug}` : null,
    fetcher,
    swrOptions,
  )
}

export function useCustomerDetail(id: string) {
  return useSWR<
    | {
        customer: Customer
        linkedAccounts: CustomerLinkedAccount[]
        bookings: Array<
          Pick<Booking, "id" | "bookingNumber" | "stage" | "consultant" | "departureDate" | "createdAt"> & {
            direction: string | null
            supplierName: string | null
          }
        >
      }
    | { error: string }
  >(id ? `/api/customers/${id}` : null, fetcher, {
    ...swrOptions,
  })
}

export function useLocations() {
  return useSWR<Location[]>("/api/locations", fetcher, swrOptions)
}

export function useSupplierEmailLabels() {
  return useSWR<SupplierEmailLabel[]>("/api/supplier-email-labels", fetcher, swrOptions)
}

export function useRateTypes() {
  return useSWR<{ rateTypes: RateType[]; canEdit: boolean }>(
    "/api/rate-types",
    fetcher,
    swrOptions,
  )
}

export function useVoucherTemplate() {
  return useSWR<VoucherTemplate>("/api/voucher-template", fetcher, swrOptions)
}

export interface DocumentTextSettings {
  quote_doc_title: string
  quote_doc_footer_text: string
  quote_doc_includes_heading: string
  quote_doc_excludes_heading: string
  quote_doc_excludes_default: string
  voucher_doc_title: string
  invoice_doc_deposit_title: string
  invoice_doc_final_title: string
  invoice_doc_footer_text: string
  invoice_doc_payment_note: string
  invoice_doc_bank_charges_note: string
  itinerary_doc_journey_heading: string
  itinerary_doc_intro_text: string
}

export function useDocumentTextSettings() {
  return useSWR<DocumentTextSettings>("/api/settings/document-text", fetcher, swrOptions)
}

export interface DocumentBrandSettings {
  brand_block_heading: string
  brand_block_subheading: string
  brand_block_logo_url: string
  brand_block_position_quote: string
  brand_block_position_invoice: string
  brand_block_position_email: string
}

export function useDocumentBrandSettings() {
  return useSWR<DocumentBrandSettings>("/api/settings/document-brand", fetcher, swrOptions)
}

export interface EmailAppearanceSettings {
  email_font_family: string
  email_font_size: string
}

export function useEmailAppearanceSettings() {
  return useSWR<EmailAppearanceSettings>("/api/settings/email-appearance", fetcher, swrOptions)
}

export interface EmailSignatureSettings {
  signature_enabled: string
  signature_company_line: string
  signature_registration_line: string
  signature_trading_hours: string
  signature_divisions_line: string
  signature_confidentiality: string
  signature_office_address: string
}

export function useEmailSignatureSettings() {
  return useSWR<EmailSignatureSettings>("/api/settings/email-signature", fetcher, swrOptions)
}

export interface SignatureBrandSummary {
  id: string
  name: string
  sortOrder: number
}

export function useSignatureBrands() {
  return useSWR<{ brands: SignatureBrandSummary[]; enabled: boolean }>(
    "/api/settings/signature-brands",
    fetcher,
    swrOptions,
  )
}

export interface PaymentMethodSummary {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
  sortOrder: number
}

export function usePaymentMethods() {
  return useSWR<{ methods: PaymentMethodSummary[] }>("/api/settings/payment-methods", fetcher, swrOptions)
}

export interface SystemInfo {
  dataMode: string
  emailProvider: string
}

export function useSystemInfo() {
  return useSWR<SystemInfo>("/api/settings/system-info", fetcher, swrOptions)
}

export function useTrainChildPriceRatio() {
  return useSWR<{ ratio: number }>("/api/settings/train-child-price-ratio", fetcher, swrOptions)
}

export function useAgeBandsSettings() {
  return useSWR<{ infantMaxAge: number; childMaxAge: number }>(
    "/api/settings/age-bands",
    fetcher,
    swrOptions,
  )
}
