import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { firstRecord } from "@/lib/utils"
import type {
  WorksheetPayment,
  WorksheetPaxRow,
  WorksheetPdfData,
  WorksheetServiceLine,
} from "@/lib/worksheet/pdf/worksheet-document"

export type WorksheetView = Omit<WorksheetPdfData, "brand" | "brandLogo">

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

const SUPPLIER_KIND_LABEL: Record<string, string> = {
  hotel: "Hotel",
  transfer: "Transfer",
  activity: "Activity",
  restaurant: "Restaurant",
  other: "Other",
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
    { data: schedules },
    { data: transportRequests },
    { data: invoices },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        `id, booking_number, consultant, departure_date, trip_end_date, no_of_adults, no_of_children,
         voucher_sent_at, deposit_paid_at, final_paid_at, invoice_balance,
         customer:customers(title, first_name, last_name, email, phone, country),
         package:packages!bookings_package_id_fkey(name), route:routes(name)`,
      )
      .eq("id", bookingId)
      .maybeSingle(),
    supabase
      .from("travellers")
      .select("prefix, first_name, last_name, residence, date_of_birth, is_primary, sort_order")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("booking_reservation_details")
      .select("meal_seating, smoking_preference, dietary, medical, occasion")
      .eq("booking_id", bookingId)
      .maybeSingle(),
    supabase
      .from("booking_supplier_schedules")
      .select("supplier_kind, label, date_from, date_to, notes, sort_order, supplier:suppliers(name)")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("booking_transport_requests")
      .select("service_type, pickup_point, dropoff_point, pickup_at, notes, supplier_reference, sort_order")
      .eq("booking_id", bookingId)
      .order("sort_order"),
    supabase
      .from("invoices")
      .select("kind, status, deposit_percentage, due_date, created_at")
      .eq("booking_id", bookingId)
      .order("created_at"),
    supabase
      .from("payments")
      .select("amount, received_at, method, reference")
      .eq("booking_id", bookingId)
      .order("received_at"),
  ])

  if (bookingError || !bookingRaw) throw new Error("Booking not found")

  const customer = firstRecord(bookingRaw.customer)
  const bookingPackage = firstRecord(bookingRaw.package)
  const route = firstRecord(bookingRaw.route)

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
    // Room with / Room type: v2 manual-capture columns, not yet on `travellers`.
    roomWith: null,
    roomType: null,
    // The reservation-form remark (seating/smoking/dietary/medical/occasion) is
    // recorded once per booking, not per traveller — attach it to the primary
    // guest's row rather than fabricating a per-pax value.
    remarks: (t.is_primary || i === 0) ? remark : null,
  }))

  const scheduleLines: WorksheetServiceLine[] = (schedules ?? []).map((s) => {
    const supplier = firstRecord(s.supplier)
    const kindLabel = SUPPLIER_KIND_LABEL[s.supplier_kind] ?? s.supplier_kind
    const description = [kindLabel, supplier?.name, s.label].filter(Boolean).join(" — ")
    return {
      fromDate: s.date_from,
      toDate: s.date_to,
      description: description || kindLabel,
      // Booking/confirmation/payment-made dates, paid-with, payable, receivable:
      // v2 manual-capture columns, not yet on `booking_supplier_schedules`.
      bookingDate: null,
      confirmationDate: null,
      reservationReference: null,
      paymentMadeDate: null,
      paidWith: null,
      amountPayable: null,
      amountReceivable: null,
      notes: s.notes,
    }
  })

  const transportLines: WorksheetServiceLine[] = (transportRequests ?? []).map((r) => ({
    fromDate: r.pickup_at ? r.pickup_at.slice(0, 10) : null,
    toDate: null,
    description: `Transfer — ${r.service_type}: ${r.pickup_point} → ${r.dropoff_point}`,
    bookingDate: null,
    confirmationDate: null,
    reservationReference: r.supplier_reference,
    paymentMadeDate: null,
    paidWith: null,
    amountPayable: null,
    amountReceivable: null,
    notes: r.notes,
  }))

  const serviceLines = [...scheduleLines, ...transportLines].sort((a, b) => {
    if (!a.fromDate) return 1
    if (!b.fromDate) return -1
    return a.fromDate.localeCompare(b.fromDate)
  })

  const paymentRows: WorksheetPayment[] = (payments ?? []).map((p) => ({
    date: p.received_at,
    paidWith: p.method,
    amount: Number(p.amount ?? 0),
    reference: p.reference,
  }))

  const noOfPax = pax.length > 0 ? pax.length : (bookingRaw.no_of_adults ?? 0) + (bookingRaw.no_of_children ?? 0)

  return {
    bookingNumber: bookingRaw.booking_number,
    productName: bookingPackage?.name ?? route?.name ?? null,
    consultant: bookingRaw.consultant,
    arriveDate,
    departDate,
    noOfPax,
    contact: {
      title: customer?.title ?? null,
      name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim() || "Guest",
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
    docsBy: bookingRaw.consultant,
    pax,
    serviceLines,
    payments: paymentRows,
    hasSupplierCosts: serviceLines.some((l) => l.amountPayable != null),
  }
}
