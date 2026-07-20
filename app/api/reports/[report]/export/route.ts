import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { formatDisplayDate } from "@/lib/date-format"
import { getReadOnlyExportsAllowed } from "@/lib/settings-access"
import { salesPerSalesperson } from "@/lib/reports/sales-per-salesperson"
import { conversionRate } from "@/lib/reports/conversion-rate"
import { revenuePerProduct } from "@/lib/reports/revenue-per-product"
import { outstandingPayments } from "@/lib/reports/outstanding-payments"
import { enquiriesBySource } from "@/lib/reports/enquiries-by-source"
import { toCsv } from "@/lib/reports/to-csv"
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

function buildCsv(report: ReportName, data: unknown[]): string {
  switch (report) {
    case "sales-per-salesperson": {
      const rows = data as { consultant: string; bookingCount: number; revenue: number; wonCount: number }[]
      return toCsv(
        ["Consultant", "Bookings", "Revenue (R)", "Won"],
        rows.map((r) => [r.consultant, r.bookingCount, r.revenue, r.wonCount]),
      )
    }
    case "conversion-rate": {
      const r = data[0] as { total: number; won: number; lost: number; cancelled: number; rate: number } | undefined
      if (!r) return toCsv(["Total", "Won", "Lost", "Cancelled", "Rate"], [])
      return toCsv(
        ["Total", "Won", "Lost", "Cancelled", "Rate"],
        [[r.total, r.won, r.lost, r.cancelled, `${(r.rate * 100).toFixed(1)}%`]],
      )
    }
    case "revenue-per-product": {
      const rows = data as { product: string; revenue: number; bookingCount: number }[]
      return toCsv(
        ["Product", "Revenue (R)", "Bookings"],
        rows.map((r) => [r.product, r.revenue, r.bookingCount]),
      )
    }
    case "outstanding-payments": {
      const rows = data as {
        bookingNumber: string
        consultant: string | null
        departureDate: string | null
        balance: number
        stage: string
      }[]
      return toCsv(
        ["Booking Number", "Consultant", "Departure Date", "Balance (R)", "Stage"],
        rows.map((r) => [
          r.bookingNumber,
          r.consultant ?? "",
          formatDisplayDate(r.departureDate),
          r.balance,
          r.stage,
        ]),
      )
    }
    case "enquiries-by-source": {
      const rows = data as { source: string; count: number }[]
      return toCsv(["Source", "Count"], rows.map((r) => [r.source, r.count]))
    }
  }
}

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

  if (profileError || !profile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const role = profile.clearance_level
  if (!["admin", "manager"].includes(role)) {
    const allowed = await getReadOnlyExportsAllowed(supabase)
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
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
  const reportName = report as ReportName

  let reportData: unknown[]
  switch (reportName) {
    case "sales-per-salesperson":
      reportData = salesPerSalesperson(bookingRows, paymentRows, filter)
      break
    case "conversion-rate":
      reportData = [conversionRate(bookingRows, filter)]
      break
    case "revenue-per-product":
      reportData = revenuePerProduct(bookingRows, paymentRows, filter)
      break
    case "outstanding-payments":
      reportData = outstandingPayments(bookingRows, filter)
      break
    case "enquiries-by-source":
      reportData = enquiriesBySource(bookingRows, filter)
      break
  }

  const csv = buildCsv(reportName, reportData)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${report}-${Date.now()}.csv"`,
    },
  })
}
