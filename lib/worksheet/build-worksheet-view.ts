import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { firstRecord } from "@/lib/utils"
import {
  buildWorksheetServiceLines,
  type WorksheetScheduleRow,
  type WorksheetServiceRow,
  type WorksheetTransportRow,
} from "@/lib/worksheet/service-lines"
import type {
  WorksheetPayment,
  WorksheetPaxRow,
  WorksheetPdfData,
} from "@/lib/worksheet/pdf/worksheet-document"

export type WorksheetView = Omit<WorksheetPdfData, "brandLogo">

/** Age at the booking's departure (or today, if no departure date is set yet). */
function computeAge(dateOfBirth: string | null, asOf: string | null): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const reference = asOf ? new Date(asOf) : new Date()
  let age = reference.getFullYear() - dob.getFullYear()
  const monthDiff = reference.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < dob.getDate())) {
    age -= 1
  }
  return age >= 0 ? age : null
}

function meanFormattedRemark(
  reservation: { meal_seating: string | null; smoking_preference: string | null; dietary: string | null; medical: string | null; occasion: string | null } | null,
): string | null {
  if (!reservation) return null
  const parts: string[] = []
  if (reservation.meal_seating === "first") parts.push("1st Seating meals")
  else if (reservation.meal_seating === "second") parts.push("2nd Seating meals")
  if (reservation.smoking_preference === "non_smoking") parts.push("Nonsmoking")
  else if (reservation.smoking_preference === "smoking") parts.push("Smoking")
  if (reservation.dietary) parts.push(`Dietary: ${reservation.dietary}`)
  if (reservation.medical) parts.push(`Medical: ${reservation.medical}`)
  if (reservation.occasion) parts.push(`Occasion: ${reservation.occasion}`)
  return parts.length > 0 ? parts.join("; ") : null
}

export interface BuildWorksheetViewOptions {
  bookingId: string
}

/**
 * Loads everything the internal booking worksheet describes. This is the
 * per-job "place of record" PDF's data source — deliberately its own query
 * (not the shared job-detail aggregate) so it can pull the tables that
 * aggregate omits: reservation details, supplier schedules, transport legs.
 */
export async function buildWorksheetView(
  supabase: SupabaseClient<Database>,
  { bookingId }: BuildWorksheetViewOptions,
): Promise<WorksheetView> {
  const [
    { data: bookingRaw, error: bookingError },
    { data: travellers },
    { data: reservationDetails },
    { data: services },
    { data: schedules },
    { data: transportRequests },
    { data: invoices },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_number, assigned_salesperson_id, departure_date, trip_end_date, no_of_adults, no_of_children,
         voucher_sent_at, deposit_paid_at, final_paid_at, invoice_balance,
         customer:customers(title, first_name, last_name, email, phone, country)`,
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("travellers")
      .select("prefix, first_name, last_name, residence, date_of_birth, room_with, room_type, is_primary, sort_order")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("booking_reservation_details")
      .select("meal_seating, smoking_preference, dietary, medical, occasion")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    // The booking's real itinerary. The Suppliers tab (booking_supplier_schedules, below) only
    // ever held the admin dates staff type by hand, so reading it alone left every train, hotel
    // and flight off the sheet.
    supabase
      .from("booking_services")
      .select(
        `id, supplier_id, sort_order, service_date, nights, arrival_date, supplier_reference, notes, route_reversed,
         suppliers(name, kind),
         routes(duration_days, name, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name)),
         suite_types(name),
         units:booking_service_units(complimentary_first_night, suite_types(name))`,
      )
      .eq("booking_id", bookingId)
      .eq("selected", true)
      .order("sort_order"),
    supabase
      .from("booking_supplier_schedules")
      .select("supplier_id, booking_date, confirmation_date, payment_made_date, paid_with")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("booking_transport_requests")
      .select("service_id, supplier_id, sort_order, pickup_at, notes, supplier_reference, suppliers(name)")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("invoices")
      .select("kind, status, deposit_percentage, due_date, created_at")
      .eq("booking_id", bookingId)
      .order("created_at"),
    supabase
      .from("payments")
      .select("received_at, method, reference, amount")
      .eq("booking_id", bookingId)
      .order("received_at"),
  ])

  if (bookingError || !bookingRaw) throw new Error("Booking not found")

  const customer = firstRecord(bookingRaw.customer)

  // profiles carries no foreign key to bookings, so it cannot be embedded in the select above —
  // the assigned salesperson is resolved by a second lookup, as elsewhere in the app.
  let consultant: string | null = null
  if (bookingRaw.assigned_salesperson_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, surname")
      .eq("user_id", bookingRaw.assigned_salesperson_id)
      .maybeSingle()
    consultant = [profile?.name, profile?.surname].filter(Boolean).join(" ").trim() || null
  }

  const arriveDate = bookingRaw.departure_date
  const departDate = bookingRaw.trip_end_date

  const depositInvoice = (invoices ?? []).find((i) => i.kind === "deposit") ?? null
  const finalInvoice = (invoices ?? []).find((i) => i.kind === "final") ?? null
  const fullInvoice = (invoices ?? []).find((i) => i.kind === "full") ?? null
  const firstInvoice = (invoices ?? [])[0] ?? null

  const remark = meanFormattedRemark(reservationDetails ?? null)

  const pax: WorksheetPaxRow[] = (travellers ?? []).map((t, i) => ({
    title: t.prefix,
    firstName: t.first_name,
    lastName: t.last_name,
    nationality: t.residence,
    age: computeAge(t.date_of_birth, arriveDate),
    roomWith: t.room_with,
    roomType: t.room_type,
    // The reservation-form remark (seating/smoking/dietary/medical/occasion) is
    // recorded once per booking, not per traveller — attach it to the primary
    // guest's row rather than fabricating a per-pax value.
    remarks: (t.is_primary || i === 0) ? remark : null,
  }))

  const serviceRows = (services ?? []) as unknown as WorksheetServiceRow[]
  const serviceLines = buildWorksheetServiceLines({
    services: serviceRows,
    transportRequests: (transportRequests ?? []) as unknown as WorksheetTransportRow[],
    schedules: (schedules ?? []) as unknown as WorksheetScheduleRow[],
  })

  // The header's "Service" cell names the rail operator this job is built around — in practice
  // The Blue Train or Rovos Rail — and stays blank on a booking with no train.
  const trainService = serviceRows.find((row) => firstRecord(row.suppliers)?.kind === "train_operator")
  const serviceName = firstRecord(trainService?.suppliers)?.name ?? null

  const paymentRows: WorksheetPayment[] = (payments ?? []).map((p) => ({
    date: p.received_at,
    paidWith: p.method,
    reference: p.reference,
    amount: p.amount,
  }))

  const noOfPax = pax.length > 0 ? pax.length : (bookingRaw.no_of_adults ?? 0) + (bookingRaw.no_of_children ?? 0)

  return {
    bookingNumber: bookingRaw.booking_number,
    serviceName,
    consultant,
    arriveDate,
    departDate,
    noOfPax,
    contact: {
      title: customer?.title ?? null,
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || "Guest",
      shortName: customer?.first_name
        ? `${customer.first_name.trim().charAt(0).toUpperCase()}. ${customer?.last_name ?? ""}`.trim()
        : (customer?.last_name ?? "Guest"),
      nationality: customer?.country ?? null,
      email: customer?.email ?? null,
      phone: customer?.phone ?? null,
    },
    invoiceDate: firstInvoice?.created_at ?? null,
    depositPercentage: fullInvoice ? null : (depositInvoice?.deposit_percentage ?? null),
    depositDueDate: fullInvoice ? null : (depositInvoice?.due_date ?? null),
    depositPaidAt: fullInvoice ? null : bookingRaw.deposit_paid_at,
    finalDueDate: fullInvoice ? fullInvoice.due_date : (finalInvoice?.due_date ?? null),
    finalPaidAt: bookingRaw.final_paid_at,
    allPaid: (bookingRaw.invoice_balance ?? 0) <= 0 && (invoices ?? []).length > 0,
    allSent: Boolean(bookingRaw.voucher_sent_at),
    docsDate: bookingRaw.voucher_sent_at,
    docsBy: consultant,
    pax,
    serviceLines,
    payments: paymentRows,
  }
}
