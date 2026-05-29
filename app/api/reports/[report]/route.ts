import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { salesPerSalesperson } from "@/lib/reports/sales-per-salesperson"
import { conversionRate } from "@/lib/reports/conversion-rate"
import { revenuePerProduct } from "@/lib/reports/revenue-per-product"
import { outstandingPayments } from "@/lib/reports/outstanding-payments"
import { enquiriesBySource } from "@/lib/reports/enquiries-by-source"
import type { BookingInputRow, PaymentInputRow, ReportFilter } from "@/lib/reports/types"

const REPORT_NAMES = [
  "sales-per-salesperson",
  "conversion-rate",
  "revenue-per-product",
  "outstanding-payments",
  "enquiries-by-source",
] as const

type ReportName = (typeof REPORT_NAMES)[number]

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  consultant: z.string().optional(),
  product: z.enum(["BT", "RR"]).optional(),
  stage: z.string().optional(),
})

export async function GET(
  req: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { report } = await params
  if (!(REPORT_NAMES as readonly string[]).includes(report)) {
    return NextResponse.json({ error: "Unknown report" }, { status: 404 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const filter: ReportFilter = parsed.data

  let bookingQuery = supabase
    .from("bookings")
    .select(
      "id, booking_number, consultant, departure_date, stage, outcome, source, invoice_balance, created_at",
    )

  if (filter.from) bookingQuery = bookingQuery.gte("created_at", filter.from)
  if (filter.to) bookingQuery = bookingQuery.lte("created_at", filter.to + "T23:59:59Z")
  if (filter.consultant) bookingQuery = bookingQuery.eq("consultant", filter.consultant)
  if (filter.stage) bookingQuery = bookingQuery.eq("stage", filter.stage as never)
  if (filter.product) bookingQuery = bookingQuery.ilike("booking_number", `${filter.product}-%`)

  const { data: bookings, error: bookingsError } = await bookingQuery
  if (bookingsError) {
    return NextResponse.json({ error: bookingsError.message }, { status: 500 })
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("booking_id, amount, received_at")
    .gt("amount", 0)

  if (paymentsError) {
    return NextResponse.json({ error: paymentsError.message }, { status: 500 })
  }

  const bookingRows = (bookings ?? []) as BookingInputRow[]
  const paymentRows = (payments ?? []) as PaymentInputRow[]

  switch (report as ReportName) {
    case "sales-per-salesperson":
      return NextResponse.json({ data: salesPerSalesperson(bookingRows, paymentRows, filter) })
    case "conversion-rate":
      return NextResponse.json({ data: conversionRate(bookingRows, filter) })
    case "revenue-per-product":
      return NextResponse.json({ data: revenuePerProduct(bookingRows, paymentRows, filter) })
    case "outstanding-payments":
      return NextResponse.json({ data: outstandingPayments(bookingRows, filter) })
    case "enquiries-by-source":
      return NextResponse.json({ data: enquiriesBySource(bookingRows, filter) })
  }
}
