import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { isRole } from "@/lib/role-utils"
import { salesPerSalesperson } from "@/lib/reports/sales-per-salesperson"
import { conversionRate } from "@/lib/reports/conversion-rate"
import { revenuePerProduct } from "@/lib/reports/revenue-per-product"
import { outstandingPayments } from "@/lib/reports/outstanding-payments"
import { enquiriesBySource } from "@/lib/reports/enquiries-by-source"
import { loadReportInputRows } from "@/lib/reports/booking-query"
import type { ReportFilter } from "@/lib/reports/types"

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
  // Train operator supplier id — product is resolved from the booked route's
  // supplier, not from the booking number.
  product: z.string().uuid().optional(),
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !isRole(profile.clearance_level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  const { rows, error: rowsError } = await loadReportInputRows(supabase, filter)
  if (rowsError) {
    return NextResponse.json({ error: rowsError }, { status: 500 })
  }

  const bookingRows = rows.bookings
  const paymentRows = rows.payments

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
