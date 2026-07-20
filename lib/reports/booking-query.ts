import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { withOwnerNames } from "./owner-names"
import { withProductSuppliers } from "./product-suppliers"
import type { BookingInputRow, PaymentInputRow, ReportFilter } from "./types"

type Client = SupabaseClient<Database>

export const REPORT_BOOKING_COLUMNS =
  "id, booking_number, consultant, assigned_salesperson_id, route_id, departure_date, stage, outcome, source, invoice_balance, created_at"

export interface ReportInputRows {
  bookings: BookingInputRow[]
  payments: PaymentInputRow[]
}

/**
 * Loads the booking and payment rows every report runs on, enriched with owner
 * names and product suppliers. Shared by the JSON report route and the CSV
 * export route so the two cannot drift apart.
 *
 * The product filter is applied in memory by applyBookingFilter rather than in
 * the query, because product comes from the booking's route supplier and not
 * from any column on bookings.
 */
export async function loadReportInputRows(
  supabase: Client,
  filter: ReportFilter,
): Promise<{ rows: ReportInputRows; error: string | null }> {
  let bookingQuery = supabase.from("bookings").select(REPORT_BOOKING_COLUMNS)

  if (filter.from) bookingQuery = bookingQuery.gte("created_at", filter.from)
  if (filter.to) bookingQuery = bookingQuery.lte("created_at", filter.to + "T23:59:59Z")
  // The consultant filter value is the owner's user id (assigned_salesperson_id).
  if (filter.consultant) bookingQuery = bookingQuery.eq("assigned_salesperson_id", filter.consultant)
  if (filter.stage) bookingQuery = bookingQuery.eq("stage", filter.stage as never)

  const { data: bookings, error: bookingsError } = await bookingQuery
  if (bookingsError) {
    return { rows: { bookings: [], payments: [] }, error: bookingsError.message }
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("booking_id, amount, received_at")
    .gt("amount", 0)

  if (paymentsError) {
    return { rows: { bookings: [], payments: [] }, error: paymentsError.message }
  }

  const withOwners = await withOwnerNames(supabase, (bookings ?? []) as BookingInputRow[])
  const enriched = await withProductSuppliers(supabase, withOwners)

  return {
    rows: { bookings: enriched, payments: (payments ?? []) as PaymentInputRow[] },
    error: null,
  }
}
