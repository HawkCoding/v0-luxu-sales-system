"use client"

import { useCallback } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import useSWR from "swr"
import { useData } from "@/lib/use-data"
import { useRole } from "@/lib/role-context"
import { formatDisplayDate } from "@/lib/date-format"
import { DatePicker } from "@/components/ui/date-picker"
import {
  getCanonicalPipelineStage,
  PIPELINE_STAGES,
  type Booking,
  type Customer,
  type Payment,
  type PipelineStage,
  type Quote,
  type Source,
} from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import type { SalesPerSalespersonRow } from "@/lib/reports/sales-per-salesperson"
import type { ConversionRateResult } from "@/lib/reports/conversion-rate"
import type { RevenuePerProductRow } from "@/lib/reports/revenue-per-product"
import type { OutstandingPaymentRow } from "@/lib/reports/outstanding-payments"
import type { EnquiriesBySourceRow } from "@/lib/reports/enquiries-by-source"

interface ReportingData {
  bookings: Booking[]
  customers: Customer[]
  payments: Payment[]
  quotes: Quote[]
}

const SOURCE_LABELS: Record<Source, string> = {
  web_form: "Web Form",
  paste_import: "Paste Import",
  advertisement: "Advertisement",
  walk_in: "Walk In",
  referral: "Referral",
  social_media: "Social Media",
  phone_call: "Phone Call",
  email: "Email",
  travel_agent: "Travel Agent",
}

const UPCOMING_DEPARTURE_LIMIT = 8
const UPCOMING_DEPARTURE_WINDOW_DAYS = 30

const jsonFetcher = (url: string) => fetch(url).then((r) => r.json())

// Whole-rand formatting for management reporting (avoids stray half-cents like "R 590,817.5").
function formatRand(amount: number): string {
  return `R ${Math.round(amount).toLocaleString("en-ZA")}`
}

export default function ReportingPage() {
  const { data, isLoading } = useData(["bookings", "customers", "payments", "quotes"])
  const { can } = useRole()
  const canExport = can("export:reporting")

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const filterFrom = searchParams.get("from") ?? ""
  const filterTo = searchParams.get("to") ?? ""
  const filterConsultant = searchParams.get("consultant") ?? ""
  const filterProduct = searchParams.get("product") ?? ""
  const filterStage = searchParams.get("stage") ?? ""

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [searchParams, router, pathname],
  )

  const filterQs = new URLSearchParams({
    ...(filterFrom && { from: filterFrom }),
    ...(filterTo && { to: filterTo }),
    ...(filterConsultant && { consultant: filterConsultant }),
    ...(filterProduct && { product: filterProduct }),
    ...(filterStage && { stage: filterStage }),
  }).toString()

  const qs = filterQs ? `?${filterQs}` : ""

  const { data: salesData, isLoading: salesLoading } = useSWR<{ data: SalesPerSalespersonRow[] }>(
    `/api/reports/sales-per-salesperson${qs}`,
    jsonFetcher,
  )
  const { data: convData, isLoading: convLoading } = useSWR<{ data: ConversionRateResult }>(
    `/api/reports/conversion-rate${qs}`,
    jsonFetcher,
  )
  const { data: revenueData, isLoading: revenueLoading } = useSWR<{ data: RevenuePerProductRow[] }>(
    `/api/reports/revenue-per-product${qs}`,
    jsonFetcher,
  )
  const { data: outstandingData, isLoading: outstandingLoading } = useSWR<{
    data: OutstandingPaymentRow[]
  }>(`/api/reports/outstanding-payments${qs}`, jsonFetcher)
  const { data: sourceData, isLoading: sourceLoading } = useSWR<{ data: EnquiriesBySourceRow[] }>(
    `/api/reports/enquiries-by-source${qs}`,
    jsonFetcher,
  )

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-secondary rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const reportingData = data as ReportingData
  const { bookings, customers, payments, quotes } = reportingData

  const totalRevenue = payments.reduce((s: number, p: Payment) => s + p.amount, 0)
  const outstandingBalance = bookings.reduce((sum, booking) => {
    const balance = booking.invoiceBalance ?? 0
    return balance > 0 ? sum + balance : sum
  }, 0)
  const openJobs = bookings.filter(
    (b) => !["closed", "lost"].includes(getCanonicalPipelineStage(b.stage)),
  ).length
  const closedJobs = bookings.filter((b) => getCanonicalPipelineStage(b.stage) === "closed").length
  const lostJobs = bookings.filter((b) => getCanonicalPipelineStage(b.stage) === "lost").length
  const conversionRate =
    bookings.length > 0 ? ((closedJobs / bookings.length) * 100).toFixed(1) : "0"

  const stageCounts = PIPELINE_STAGES.map((s) => ({
    ...s,
    count: bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === s.key)
      .length,
  }))

  const byMethod = payments.reduce((acc: Record<string, number>, p: Payment) => {
    acc[p.method] = (acc[p.method] || 0) + p.amount
    return acc
  }, {})

  const byCountry = customers.reduce((acc: Record<string, number>, c: Customer) => {
    const country = c.country ?? "Unknown"
    acc[country] = (acc[country] || 0) + 1
    return acc
  }, {})
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5)

  const quoteStats = quotes.reduce((acc: Record<string, number>, q: Quote) => {
    acc[q.status] = (acc[q.status] || 0) + 1
    return acc
  }, {})

  const pipelineValue = quotes
    .filter((q: Quote) => ["ready", "sent"].includes(q.status))
    .reduce((s: number, q: Quote) => s + q.total, 0)

  const bySource = Object.entries(
    bookings.reduce((acc: Record<string, number>, booking) => {
      acc[booking.source] = (acc[booking.source] || 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  // Owner = assigned salesperson (reflects reassignments), falling back to
  // "Unassigned". This matches how the server-side reports resolve ownership.
  const ownerCounts = bookings.reduce((acc: Record<string, number>, booking) => {
    const label = booking.assignedSalespersonName ?? "Unassigned"
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, {})
  const consultantRows = Object.entries(ownerCounts)
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count)

  // Filter options for the owner dropdown, keyed by user id (assigned_salesperson_id).
  const ownerFilterOptions = (() => {
    const map = new Map<string, string>()
    for (const booking of bookings) {
      if (booking.assignedSalespersonId) {
        map.set(booking.assignedSalespersonId, booking.assignedSalespersonName ?? booking.assignedSalespersonId)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  })()

  const customerNames = new Map(
    customers.map((customer) => [
      customer.id,
      `${customer.firstName} ${customer.lastName}`.trim() || customer.email,
    ]),
  )
  const today = getStartOfToday()
  const thirtyDaysFromNow = new Date(today)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + UPCOMING_DEPARTURE_WINDOW_DAYS)
  const upcomingDepartures = bookings
    .filter((booking) => {
      const departureDate = parseDateString(booking.departureDate)
      return (
        departureDate !== null &&
        departureDate >= today &&
        departureDate <= thirtyDaysFromNow &&
        !["closed", "lost"].includes(getCanonicalPipelineStage(booking.stage))
      )
    })
    .sort((a, b) => {
      const aDate = parseDateString(a.departureDate)?.getTime() ?? 0
      const bDate = parseDateString(b.departureDate)?.getTime() ?? 0
      return aDate - bDate
    })
    .slice(0, UPCOMING_DEPARTURE_LIMIT)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Reporting</h1>
        <p className="text-base text-muted-foreground mt-2">Sales performance overview</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-4">
        <KPI label="Total Revenue" value={formatRand(totalRevenue)} />
        <KPI label="Pipeline Value" value={formatRand(pipelineValue)} />
        <KPI label="Outstanding Balance" value={formatRand(outstandingBalance)} />
        <KPI label="Open Jobs" value={openJobs} />
        <KPI label="Closed/Won" value={closedJobs} />
        <KPI label="Lost" value={lostJobs} />
        <KPI label="Conversion" value={`${conversionRate}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pipeline Distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stageCounts.map((s) => {
              const pct = data.bookings.length > 0 ? (s.count / data.bookings.length) * 100 : 0
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-xs font-medium text-foreground">{s.count}</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-gold rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Revenue by Method */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Revenue by Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(byMethod).map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{method}</span>
                <span
                  className={`text-sm font-medium ${(amount as number) >= 0 ? "text-foreground" : "text-payment-red"}`}
                >
                  {formatRand(amount as number)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Countries */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Top Customer Countries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topCountries.map(([country, count]) => (
              <div key={country} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{country}</span>
                <Badge variant="secondary" className="text-xs">
                  {count as number}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quote Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Quote Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(quoteStats).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{status.replace(/_/g, " ")}</span>
                <Badge variant="secondary" className="text-xs">
                  {count as number}
                </Badge>
              </div>
            ))}
            <Separator />
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm font-medium text-foreground">Total Quotes</span>
              <span className="text-sm font-medium text-foreground">{data.quotes.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Bookings by Source */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bookings by Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {bySource.length > 0 ? (
              bySource.map(([source, count]) => (
                <div key={source} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-muted-foreground">
                    {SOURCE_LABELS[source as Source] ?? source.replace(/_/g, " ")}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {count}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyCardText>No booking sources yet</EmptyCardText>
            )}
          </CardContent>
        </Card>

        {/* Bookings by Consultant */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bookings by Consultant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {consultantRows.map((consultant) => (
              <div key={consultant.key} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{consultant.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {consultant.count}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Departures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Upcoming Departures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingDepartures.length > 0 ? (
              upcomingDepartures.map((booking) => (
                <div
                  key={booking.id}
                  className="flex items-center justify-between gap-4 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {booking.bookingNumber}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customerNames.get(booking.customerId) ?? "Unknown customer"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {booking.departureDateDisplay ?? formatDisplayDate(booking.departureDate)}
                  </span>
                </div>
              ))
            ) : (
              <EmptyCardText>No active departures in the next 30 days</EmptyCardText>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Filtered Reports ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Filtered Reports</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Filter by date range, consultant, or product
            </p>
          </div>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap gap-3 mb-6 p-4 bg-secondary/40 rounded-lg border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              From
            </label>
            <DatePicker
              value={filterFrom}
              onChange={(value) => updateFilter("from", value ?? "")}
              placeholder="Any"
              className="w-40"
              buttonClassName="h-8"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              To
            </label>
            <DatePicker
              value={filterTo}
              onChange={(value) => updateFilter("to", value ?? "")}
              placeholder="Any"
              className="w-40"
              buttonClassName="h-8"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Consultant
            </label>
            <select
              value={filterConsultant}
              onChange={(e) => updateFilter("consultant", e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All</option>
              {ownerFilterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Product
            </label>
            <select
              value={filterProduct}
              onChange={(e) => updateFilter("product", e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All</option>
              <option value="BT">Blue Train</option>
              <option value="RR">Rovos Rail</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Stage
            </label>
            <select
              value={filterStage}
              onChange={(e) => updateFilter("stage", e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {(filterFrom || filterTo || filterConsultant || filterProduct || filterStage) && (
            <div className="flex flex-col justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(pathname)}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales per Salesperson */}
          <ReportCard
            title="Sales per Salesperson"
            report="sales-per-salesperson"
            exportQs={filterQs}
            canExport={canExport}
            isLoading={salesLoading}
            isEmpty={!salesData?.data?.length}
          >
            {salesData?.data?.map((row) => (
              <div key={row.consultant} className="flex items-start justify-between py-1.5 gap-2">
                <span className="text-sm text-muted-foreground">{row.consultant}</span>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-foreground">{formatRand(row.revenue)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.bookingCount} bookings · {row.wonCount} won
                  </p>
                </div>
              </div>
            ))}
          </ReportCard>

          {/* Conversion Rate */}
          <ReportCard
            title="Conversion Rate"
            report="conversion-rate"
            exportQs={filterQs}
            canExport={canExport}
            isLoading={convLoading}
            isEmpty={!convData?.data}
          >
            {convData?.data && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total bookings</span>
                  <span className="text-sm font-medium text-foreground">{convData.data.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Won (Closed)</span>
                  <span className="text-sm font-medium text-foreground">{convData.data.won}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lost</span>
                  <span className="text-sm font-medium text-foreground">{convData.data.lost}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Cancelled</span>
                  <span className="text-sm font-medium text-foreground">{convData.data.cancelled}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Conversion rate</span>
                  <span className="text-lg font-semibold text-foreground">
                    {(convData.data.rate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </ReportCard>

          {/* Revenue per Product */}
          <ReportCard
            title="Revenue per Product"
            report="revenue-per-product"
            exportQs={filterQs}
            canExport={canExport}
            isLoading={revenueLoading}
            isEmpty={!revenueData?.data?.length}
          >
            {revenueData?.data?.map((row) => (
              <div key={row.product} className="flex items-start justify-between py-1.5">
                <span className="text-sm text-muted-foreground">
                  {row.product === "BT" ? "Blue Train" : row.product === "RR" ? "Rovos Rail" : row.product}
                </span>
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{formatRand(row.revenue)}</p>
                  <p className="text-xs text-muted-foreground">{row.bookingCount} bookings</p>
                </div>
              </div>
            ))}
          </ReportCard>

          {/* Outstanding Payments */}
          <ReportCard
            title="Outstanding Payments"
            report="outstanding-payments"
            exportQs={filterQs}
            canExport={canExport}
            isLoading={outstandingLoading}
            isEmpty={!outstandingData?.data?.length}
            emptyText="No outstanding balances"
          >
            {outstandingData?.data?.map((row) => (
              <div key={row.bookingId} className="flex items-start justify-between py-1.5 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{row.bookingNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.consultant ?? "Unassigned"} · {formatDisplayDate(row.departureDate) || "No date"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-foreground">
                  {formatRand(row.balance)}
                </span>
              </div>
            ))}
          </ReportCard>

          {/* Enquiries by Source */}
          <ReportCard
            title="Enquiries by Source"
            report="enquiries-by-source"
            exportQs={filterQs}
            canExport={canExport}
            isLoading={sourceLoading}
            isEmpty={!sourceData?.data?.length}
          >
            {sourceData?.data?.map((row) => (
              <div key={row.source} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">
                  {SOURCE_LABELS[row.source as Source] ?? row.source.replace(/_/g, " ")}
                </span>
                <Badge variant="secondary" className="text-xs">
                  {row.count}
                </Badge>
              </div>
            ))}
          </ReportCard>
        </div>
      </div>
    </div>
  )
}

interface ReportCardProps {
  title: string
  report: string
  exportQs: string
  canExport: boolean
  isLoading: boolean
  isEmpty: boolean
  emptyText?: string
  children: React.ReactNode
}

function ReportCard({
  title,
  report,
  exportQs,
  canExport,
  isLoading,
  isEmpty,
  emptyText = "No data for selected filters",
  children,
}: ReportCardProps) {
  const exportHref = `/api/reports/${report}/export${exportQs ? `?${exportQs}` : ""}`

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {canExport && (
            <a
              href={exportHref}
              download
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Download ${title} as CSV`}
            >
              <Download className="h-3 w-3" />
              CSV
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {isLoading ? (
          <div className="animate-pulse space-y-2 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-secondary rounded" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyCardText>{emptyText}</EmptyCardText>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p
          className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          {label}
        </p>
        <p className="text-lg font-semibold text-foreground mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}

function EmptyCardText({ children }: { children: string }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>
}

function getStartOfToday(): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function parseDateString(value: string | null): Date | null {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split("-").map(Number)

  if (!year || !month || !day) {
    return null
  }

  const date = new Date(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}
