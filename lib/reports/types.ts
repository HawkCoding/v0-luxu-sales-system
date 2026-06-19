import { getCanonicalPipelineStage } from "@/lib/types"

export interface ReportFilter {
  from?: string
  to?: string
  consultant?: string
  product?: string
  stage?: string
}

export interface BookingInputRow {
  id: string
  booking_number: string
  consultant: string | null
  assigned_salesperson_id: string | null
  /**
   * Resolved owner display name (from assigned_salesperson_id → profiles).
   * Populated by the report routes before the pure report functions run so
   * ownership reflects reassignments rather than the legacy `consultant` code.
   */
  owner_name?: string | null
  departure_date: string | null
  stage: string
  outcome: string
  source: string
  invoice_balance: number | null
  created_at: string
}

export interface PaymentInputRow {
  booking_id: string
  amount: number
  received_at: string
}

export function getProductFromBookingNumber(bookingNumber: string): string {
  if (bookingNumber.startsWith("BT")) return "BT"
  if (bookingNumber.startsWith("RR")) return "RR"
  return "Other"
}

export function applyBookingFilter(
  bookings: BookingInputRow[],
  filter: ReportFilter,
): BookingInputRow[] {
  return bookings.filter((b) => {
    if (filter.from && b.created_at < filter.from) return false
    if (filter.to && b.created_at > filter.to + "T23:59:59Z") return false
    // The consultant filter value is the owner's user id (assigned_salesperson_id).
    if (filter.consultant && b.assigned_salesperson_id !== filter.consultant) return false
    if (filter.product && getProductFromBookingNumber(b.booking_number) !== filter.product) return false
    if (filter.stage && getCanonicalPipelineStage(b.stage as Parameters<typeof getCanonicalPipelineStage>[0]) !== filter.stage) return false
    return true
  })
}

export function groupPaymentsByBookingId(payments: PaymentInputRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const p of payments) {
    if (p.amount > 0) {
      map.set(p.booking_id, (map.get(p.booking_id) ?? 0) + p.amount)
    }
  }
  return map
}
