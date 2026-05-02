import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"

function addDaysToDateString(value: string, days: number): string {
  const [year = "1970", month = "1", day = "1"] = value.split("-")
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function GET() {
  const supabase = await createSessionClient()

  const [
    { data: bookings },
    { data: customers },
    { data: payments },
    { data: quotes },
    { data: thankYous },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("*, route:routes(name)")
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("id, first_name, last_name"),
    supabase.from("payments").select("booking_id, amount"),
    supabase.from("quotes").select("booking_id, total"),
    supabase.from("correspondences").select("booking_id, scheduled_at, created_at").eq("kind", "thank_you"),
  ])

  const enriched = (bookings ?? []).map((booking) => {
    const customer = (customers ?? []).find((c) => c.id === booking.customer_id)
    const bookingPayments = (payments ?? []).filter((p) => p.booking_id === booking.id)
    const bookingQuotes = (quotes ?? []).filter((q) => q.booking_id === booking.id)
    const thankYou = (thankYous ?? []).find((c) => c.booking_id === booking.id)
    const tripEndDate =
      booking.departure_date && booking.duration_nights !== null
        ? addDaysToDateString(booking.departure_date, booking.duration_nights)
        : null

    const totalPaid = bookingPayments.reduce((s, p) => s + p.amount, 0)
    const quoteTotal = bookingQuotes.reduce((s, q) => Math.max(s, q.total), 0) || 1

    let paymentColor = "red"
    if (totalPaid < 0) paymentColor = "blue"
    else if (totalPaid >= quoteTotal && totalPaid > 0) paymentColor = "green"
    else if (totalPaid >= quoteTotal * 0.25) paymentColor = "yellow"
    else if (totalPaid > 0) paymentColor = "purple"

    return {
      id: booking.id,
      bookingNumber: booking.booking_number,
      customerId: booking.customer_id,
      stage: booking.stage,
      consultant: booking.consultant,
      purpose: booking.purpose,
      source: booking.source,
      customerName: customer
        ? `${customer.first_name} ${customer.last_name}`
        : "Unknown",
      direction: (booking.route as { name?: string } | null)?.name ?? "",
      departureDate: booking.departure_date ?? "",
      departureDateDisplay: formatDisplayDate(booking.departure_date),
      durationNights: booking.duration_nights,
      tripEndDate,
      thankYouScheduledAt: thankYou?.scheduled_at ?? thankYou?.created_at ?? null,
      paymentColor,
      totalPaid,
      quoteTotal,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      createdAtDisplay: formatDisplayDateTime(booking.created_at),
      updatedAtDisplay: formatDisplayDateTime(booking.updated_at),
    }
  })

  return NextResponse.json(enriched)
}
