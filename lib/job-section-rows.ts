import {
  getRecordHref,
  isVisibleInBookings,
  isVisibleInQuotes,
  type RecordSection,
} from "@/lib/booking-visibility"
import { derivePaymentStatus, type PaymentStatus } from "@/lib/booking-payment-status"
import { formatDateISO, formatDisplayDateShort } from "@/lib/date-format"
import { BASE_CURRENCY } from "@/lib/money"
import { pickCurrentQuote } from "@/lib/quotes/current-quote"
import { getCanonicalPipelineStage, getPipelineStageLabel, PIPELINE_STAGE_LABELS, type PipelineStage } from "@/lib/types"

/** The two sections rendered by the shared list. Enquiries has its own queue page. */
export type JobListSection = Extract<RecordSection, "quotes" | "bookings">

export interface SectionBookingInput {
  id: string
  bookingNumber: string
  customerId: string
  stage: PipelineStage | string
  consultant?: string | null
  assignedSalespersonId?: string | null
  supplierName?: string | null
  direction?: string | null
  departureDate?: string | null
  createdAt: string
  quoteSentAt?: string | null
  depositPaid?: boolean | null
}

export interface SectionCustomerInput {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}

export interface SectionPaymentInput {
  bookingId: string
  amount: number | null
}

export interface SectionQuoteInput {
  id: string
  bookingId: string
  status: string
  total: number | null
  currency?: string | null
  lastSentAt?: string | null
  createdAt?: string | null
}

export interface SectionSourceData {
  bookings: SectionBookingInput[]
  customers?: SectionCustomerInput[]
  payments?: SectionPaymentInput[]
  quotes?: SectionQuoteInput[]
}

export interface JobSectionRow {
  id: string
  href: string
  bookingNumber: string
  stage: PipelineStage | string
  /** Alias-free stage — what the Status facet matches on. */
  canonicalStage: PipelineStage | string
  stageLabel: string
  customerName: string
  customerEmail: string
  consultant: string | null
  assignedSalespersonId: string | null
  supplier: string | null
  direction: string | null
  departureDate: string | null
  createdAt: string
  /** The current quote's currency; every amount on the row is in it. */
  currency: string
  /** The current quote's total (see `pickCurrentQuote`), or null when there is no priced quote. */
  quoteTotal: number | null
  totalPaid: number
  /** What is still owed against the current quote, never below zero. Null without a quote. */
  balance: number | null
  paymentStatus: PaymentStatus
  sentAt: string | null
  /** "Sent 12 Oct · 9 days ago" */
  sentLabel: string | null
  /** One-line hint for what moves this record on, or null when nothing is left to do. */
  nextStep: string | null
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function daysBetween(fromIso: string, toIso: string): number {
  const toUtc = (iso: string) => {
    const [year = "1970", month = "1", day = "1"] = iso.split("-")
    return Date.UTC(Number(year), Number(month) - 1, Number(day))
  }
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000)
}

/**
 * "Sent 12 Oct · 9 days ago", counted in South African calendar days so a quote sent late last
 * night reads "yesterday" rather than "today". The year is shown only when it isn't this year.
 */
export function formatSentLabel(sentAt: string | null | undefined, now: Date): string | null {
  const sentDay = formatDateISO(sentAt)
  const today = formatDateISO(now)
  if (!sentDay || !today) return null

  const days = Math.max(0, daysBetween(sentDay, today))
  const fullDate = formatDisplayDateShort(sentAt)
  const date = sentDay.slice(0, 4) === today.slice(0, 4) ? fullDate.replace(/ \d{4}$/, "") : fullDate
  const ago = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
  return `Sent ${date} · ${ago}`
}

function getNextStep(canonicalStage: PipelineStage | string, moneyIn: boolean): string | null {
  switch (canonicalStage) {
    case "quote_sent":
      return "Waiting for the client's go-ahead"
    case "accepted":
      return "Send the deposit invoice"
    case "deposit_requested":
      return moneyIn ? "Payment received — move to Deposit Paid" : "Waiting for the deposit"
    case "deposit_paid":
      return "Waiting for the final payment"
    case "final_paid":
      return "Send the voucher"
    case "voucher_sent":
      return "Close the booking after the trip"
    default:
      return null
  }
}

function groupByBooking<T extends { bookingId: string }>(items: readonly T[] | undefined): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const item of items ?? []) {
    const bucket = grouped.get(item.bookingId)
    if (bucket) {
      bucket.push(item)
    } else {
      grouped.set(item.bookingId, [item])
    }
  }
  return grouped
}

/**
 * Flattens the `/api/data` payload into one display row per record in `section`, in the order the
 * bookings arrive. Pure, so the list page stays a thin renderer and the money rules are testable.
 */
export function buildSectionRows(data: SectionSourceData, section: JobListSection, now: Date): JobSectionRow[] {
  const isVisible = section === "quotes" ? isVisibleInQuotes : isVisibleInBookings
  const customersById = new Map((data.customers ?? []).map((customer) => [customer.id, customer]))
  const paymentsByBooking = groupByBooking(data.payments)
  const quotesByBooking = groupByBooking(data.quotes)

  return data.bookings.filter(isVisible).map((booking) => {
    const customer = customersById.get(booking.customerId)
    const totalPaid = roundCents(
      (paymentsByBooking.get(booking.id) ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    )
    const currentQuote = pickCurrentQuote(quotesByBooking.get(booking.id) ?? [])
    const quoteTotal = currentQuote?.total == null ? null : Number(currentQuote.total)
    const canonicalStage = Object.prototype.hasOwnProperty.call(PIPELINE_STAGE_LABELS, booking.stage)
      ? getCanonicalPipelineStage(booking.stage as PipelineStage)
      : booking.stage
    const sentAt = currentQuote?.lastSentAt ?? booking.quoteSentAt ?? null
    const customerName = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim()

    return {
      id: booking.id,
      href: getRecordHref(booking.id, booking.stage),
      bookingNumber: booking.bookingNumber,
      stage: booking.stage,
      canonicalStage,
      stageLabel: getPipelineStageLabel(booking.stage),
      customerName: customerName || "Unknown",
      customerEmail: customer?.email ?? "",
      consultant: booking.consultant ?? null,
      assignedSalespersonId: booking.assignedSalespersonId ?? null,
      supplier: booking.supplierName?.trim() || null,
      direction: booking.direction ?? null,
      departureDate: booking.departureDate ?? null,
      createdAt: booking.createdAt,
      currency: currentQuote?.currency?.trim() || BASE_CURRENCY,
      quoteTotal,
      totalPaid,
      balance: quoteTotal === null ? null : Math.max(0, roundCents(quoteTotal - totalPaid)),
      paymentStatus: derivePaymentStatus({ stage: booking.stage, depositPaid: booking.depositPaid, totalPaid }),
      sentAt,
      sentLabel: formatSentLabel(sentAt, now),
      nextStep: getNextStep(canonicalStage, totalPaid > 0 || booking.depositPaid === true),
    }
  })
}
