"use client"

import { useAllData } from "@/lib/use-data"
import {
  CONSULTANTS,
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

export default function ReportingPage() {
  const { data, isLoading } = useAllData()

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-secondary rounded-lg" />)}</div></div>
  }

  const reportingData = data as ReportingData
  const { bookings, customers, payments, quotes } = reportingData

  const totalRevenue = payments.reduce((s: number, p: Payment) => s + p.amount, 0)
  const outstandingBalance = bookings.reduce((sum, booking) => {
    const balance = booking.invoiceBalance ?? 0
    return balance > 0 ? sum + balance : sum
  }, 0)
  const openJobs = bookings.filter((b) => !["closed", "lost"].includes(getCanonicalPipelineStage(b.stage))).length
  const closedJobs = bookings.filter((b) => getCanonicalPipelineStage(b.stage) === "closed").length
  const lostJobs = bookings.filter((b) => getCanonicalPipelineStage(b.stage) === "lost").length
  const conversionRate = bookings.length > 0 ? ((closedJobs / bookings.length) * 100).toFixed(1) : "0"

  const stageCounts = PIPELINE_STAGES.map(s => ({
    ...s,
    count: bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === s.key).length,
  }))

  // Revenue by method
  const byMethod = payments.reduce((acc: Record<string, number>, p: Payment) => {
    acc[p.method] = (acc[p.method] || 0) + p.amount
    return acc
  }, {})

  // Top countries
  const byCountry = customers.reduce((acc: Record<string, number>, c: Customer) => {
    const country = c.country ?? "Unknown"
    acc[country] = (acc[country] || 0) + 1
    return acc
  }, {})
  const topCountries = Object.entries(byCountry).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5)

  // Quote status breakdown
  const quoteStats = quotes.reduce((acc: Record<string, number>, q: Quote) => {
    acc[q.status] = (acc[q.status] || 0) + 1
    return acc
  }, {})

  // Pipeline value (total of ready + sent quotes)
  const pipelineValue = quotes
    .filter((q: Quote) => ["ready", "sent"].includes(q.status))
    .reduce((s: number, q: Quote) => s + q.total, 0)

  const bySource = Object.entries(
    bookings.reduce((acc: Record<string, number>, booking) => {
      acc[booking.source] = (acc[booking.source] || 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])

  const consultantKeys = new Set<string>(CONSULTANTS.map((consultant) => consultant.key))
  const byConsultant = CONSULTANTS.map((consultant) => ({
    key: consultant.key,
    label: consultant.name,
    count: bookings.filter((booking) => booking.consultant === consultant.key).length,
  }))
  const otherConsultants = Object.entries(
    bookings.reduce((acc: Record<string, number>, booking) => {
      if (!booking.consultant || consultantKeys.has(booking.consultant)) {
        return acc
      }

      acc[booking.consultant] = (acc[booking.consultant] || 0) + 1
      return acc
    }, {}),
  ).map(([consultant, count]) => ({ key: consultant, label: consultant, count }))
  const unassignedBookings = bookings.filter((booking) => !booking.consultant).length
  const consultantRows = [
    ...byConsultant,
    ...otherConsultants,
    ...(unassignedBookings > 0 ? [{ key: "unassigned", label: "Unassigned", count: unassignedBookings }] : []),
  ]

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
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Reporting</h1>
        <p className="text-sm text-muted-foreground mt-1">Sales performance overview</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-4">
        <KPI label="Total Revenue" value={`R ${totalRevenue.toLocaleString()}`} />
        <KPI label="Pipeline Value" value={`R ${pipelineValue.toLocaleString()}`} />
        <KPI label="Outstanding Balance" value={`R ${outstandingBalance.toLocaleString()}`} />
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
            {stageCounts.map(s => {
              const pct = data.bookings.length > 0 ? (s.count / data.bookings.length) * 100 : 0
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <span className="text-xs font-medium text-foreground">{s.count}</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-brand-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
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
                <span className={`text-sm font-medium ${(amount as number) >= 0 ? "text-foreground" : "text-payment-red"}`}>R {(amount as number).toLocaleString()}</span>
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
                <Badge variant="secondary" className="text-xs">{count as number}</Badge>
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
                <Badge variant="secondary" className="text-xs">{count as number}</Badge>
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
                  <span className="text-sm text-muted-foreground">{SOURCE_LABELS[source as Source] ?? source.replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-xs">{count}</Badge>
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
                <Badge variant="secondary" className="text-xs">{consultant.count}</Badge>
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
                <div key={booking.id} className="flex items-center justify-between gap-4 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{booking.bookingNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {customerNames.get(booking.customerId) ?? "Unknown customer"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {booking.departureDateDisplay ?? booking.departureDate}
                  </span>
                </div>
              ))
            ) : (
              <EmptyCardText>No active departures in the next 30 days</EmptyCardText>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-inter)" }}>{label}</p>
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
