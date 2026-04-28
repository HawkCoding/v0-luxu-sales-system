"use client"

import { useAllData } from "@/lib/use-data"
import { getCanonicalPipelineStage, PIPELINE_STAGES, type PipelineStage } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default function ReportingPage() {
  const { data, isLoading } = useAllData()

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-secondary rounded-lg" />)}</div></div>
  }

  const totalRevenue = data.payments.reduce((s: number, p: any) => s + p.amount, 0)
  const openJobs = data.bookings.filter((b: any) => !["closed", "lost"].includes(b.stage)).length
  const closedJobs = data.bookings.filter((b: any) => b.stage === "closed").length
  const lostJobs = data.bookings.filter((b: any) => b.stage === "lost").length
  const conversionRate = data.bookings.length > 0 ? ((closedJobs / data.bookings.length) * 100).toFixed(1) : "0"

  const stageCounts = PIPELINE_STAGES.map(s => ({
    ...s,
    count: data.bookings.filter((b: { stage: PipelineStage }) => getCanonicalPipelineStage(b.stage) === s.key).length,
  }))

  // Revenue by method
  const byMethod = data.payments.reduce((acc: Record<string, number>, p: any) => {
    acc[p.method] = (acc[p.method] || 0) + p.amount
    return acc
  }, {})

  // Top countries
  const byCountry = data.customers.reduce((acc: Record<string, number>, c: any) => {
    acc[c.country] = (acc[c.country] || 0) + 1
    return acc
  }, {})
  const topCountries = Object.entries(byCountry).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5)

  // Quote status breakdown
  const quoteStats = data.quotes.reduce((acc: Record<string, number>, q: any) => {
    acc[q.status] = (acc[q.status] || 0) + 1
    return acc
  }, {})

  // Pipeline value (total of ready + sent quotes)
  const pipelineValue = data.quotes
    .filter((q: any) => ["ready", "sent"].includes(q.status))
    .reduce((s: number, q: any) => s + q.total, 0)

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Reporting</h1>
        <p className="text-sm text-muted-foreground mt-1">Sales performance overview</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPI label="Total Revenue" value={`R ${totalRevenue.toLocaleString()}`} />
        <KPI label="Pipeline Value" value={`R ${pipelineValue.toLocaleString()}`} />
        <KPI label="Open Jobs" value={openJobs} />
        <KPI label="Closed/Won" value={closedJobs} />
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
