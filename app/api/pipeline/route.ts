import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createSessionClient()

  const [
    { data: bookings },
    { data: customers },
    { data: payments },
    { data: quotes },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("*, route:routes(name)")
      .order("created_at", { ascending: false }),
    supabase.from("customers").select("id, first_name, last_name"),
    supabase.from("payments").select("booking_id, amount"),
    supabase.from("quotes").select("booking_id, total"),
  ])

  const enriched = (bookings ?? []).map((booking) => {
    const customer = (customers ?? []).find((c) => c.id === booking.customer_id)
    const bookingPayments = (payments ?? []).filter((p) => p.booking_id === booking.id)
    const bookingQuotes = (quotes ?? []).filter((q) => q.booking_id === booking.id)

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
      paymentColor,
      totalPaid,
      quoteTotal,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    }
  })

  return NextResponse.json(enriched)
}
