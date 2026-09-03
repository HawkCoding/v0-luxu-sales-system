import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { clientInvoiceNumber } from "@/lib/invoices/invoice-status"
import { resolveAcceptedQuoteScope, scopeLegIdsFilter } from "@/lib/quotes/accepted-quote-scope"
import { firstRecord } from "@/lib/utils"
import {
  buildWorksheetServiceLines,
  scopeWorksheetRows,
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
 * aggregate omits: reservation details, service admin dates, transport legs.
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
    { data: transportRequests },
    { data: invoices },
    { data: payments },
    quoteScope,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_number, customer_invoice_number, assigned_salesperson_id, departure_date, trip_end_date, no_of_adults, no_of_children, primary_supplier_id,
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
    // The booking's real itinerary, including each leg's own supplier-admin dates (when it was
    // placed, confirmed and paid with the supplier) — reading services alone used to leave those
    // dates off the sheet; they lived on a separate per-supplier table with no link to the leg.
    supabase
      .from("booking_services")
      .select(
        `id, supplier_id, sort_order, service_date, nights, arrival_date, supplier_reference, notes, route_reversed,
         booking_date, confirmation_date, payment_made_date, paid_with,
         suppliers(name, kind),
         routes(duration_days, name, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name)),
         suite_types(name),
         units:booking_service_units(complimentary_first_night, suite_types(name))`,
      )
      .eq("booking_id", bookingId)
      .eq("selected", true)
      .order("sort_order"),
    supabase
      .from("booking_transport_requests")
      .select("service_id, supplier_id, sort_order, pickup_at, notes, supplier_reference, complimentary, suppliers(name)")
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
    resolveAcceptedQuoteScope(supabase, bookingId),
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

  // Scope the sheet to what the customer actually bought — see `scopeWorksheetRows`.
  const { services: serviceRows, transportRequests: transportRows } = scopeWorksheetRows(
    (services ?? []) as unknown as WorksheetServiceRow[],
    (transportRequests ?? []) as unknown as WorksheetTransportRow[],
    scopeLegIdsFilter(quoteScope),
  )

  const serviceLines = buildWorksheetServiceLines({
    services: serviceRows,
    transportRequests: transportRows,
  })

  // The header's "Service" cell names what this job is built around, and the same leg supplies the
  // header's "Departure Date". That is the rail operator on a journey — in practice The Blue Train
  // or Rovos Rail — and the property itself on a standalone stay (Kruger Shalati), which has no
  // train at all and used to leave both cells blank. A multi-leg booking is resolved by earliest
  // service_date rather than by query order, so both cells stay stable across reloads.
  const coreServices = serviceRows.filter((row) => {
    const supplier = firstRecord(row.suppliers)
    return bookingRaw.primary_supplier_id
      ? row.supplier_id === bookingRaw.primary_supplier_id
      : supplier?.kind === "train_operator"
  })
  const datedCoreServices = coreServices
    .filter((row) => Boolean(row.service_date))
    .sort((a, b) => (a.service_date ?? "").localeCompare(b.service_date ?? ""))
  // A core leg with no date still names the Service cell — it just cannot supply a departure date.
  const serviceName = firstRecord((datedCoreServices[0] ?? coreServices[0])?.suppliers)?.name ?? null
  const trainDepartureDate = datedCoreServices[0]?.service_date ?? null

  const paymentRows: WorksheetPayment[] = (payments ?? []).map((p) => ({
    date: p.received_at,
    paidWith: p.method,
    reference: p.reference,
    amount: p.amount,
  }))

  const noOfPax = pax.length > 0 ? pax.length : (bookingRaw.no_of_adults ?? 0) + (bookingRaw.no_of_children ?? 0)

  return {
    bookingNumber: bookingRaw.booking_number,
    invoiceNumber: clientInvoiceNumber({
      customer_invoice_number: bookingRaw.customer_invoice_number,
      booking_number: bookingRaw.booking_number,
    }),
    serviceName,
    trainDepartureDate,
    consultant,
    arriveDate,
    departDate,
    noOfPax,
    contact: {
      title: customer?.title ?? null,
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || "Guest",
      shortName: customer?.last_name?.trim() || "Guest",
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
