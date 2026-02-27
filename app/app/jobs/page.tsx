"use client"

import { useAllData } from "@/lib/use-data"
import { PIPELINE_STAGES } from "@/lib/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

const PAYMENT_COLORS: Record<string, string> = {
  green: "bg-payment-green",
  yellow: "bg-payment-yellow",
  red: "bg-payment-red",
  purple: "bg-payment-purple",
  blue: "bg-payment-blue",
}

export default function JobsPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")
  const [stageFilter, setStageFilter] = useState("all")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const enriched = data.bookings.map((b: any) => {
    const customer = data.customers.find((c: any) => c.id === b.customerId)
    const payments = data.payments.filter((p: any) => p.bookingId === b.id)
    const quotes = data.quotes.filter((q: any) => q.bookingId === b.id)
    const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
    const quoteTotal = quotes.reduce((s: number, q: any) => Math.max(s, q.total), 0) || 1
    let paymentColor = "red"
    if (totalPaid < 0) paymentColor = "blue"
    else if (totalPaid >= quoteTotal && totalPaid > 0) paymentColor = "green"
    else if (totalPaid >= quoteTotal * 0.25) paymentColor = "yellow"
    else if (totalPaid > 0) paymentColor = "purple"
    return {
      ...b,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      paymentColor,
      totalPaid,
    }
  })

  const filtered = enriched.filter((b: any) => {
    const matchSearch = !search || [b.bookingNumber, b.customerName, b.direction].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStage = stageFilter === "all" || b.stage === stageFilter
    return matchSearch && matchStage
  })

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} bookings</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {PIPELINE_STAGES.map(s => (
              <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map((b: any) => (
          <Link key={b.id} href={`/app/jobs/${b.id}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PAYMENT_COLORS[b.paymentColor] || "bg-muted-foreground"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-inter)" }}>{b.bookingNumber}</span>
                        <span className="text-xs text-muted-foreground">{b.customerName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {b.direction}{b.departureDate ? ` | Dep: ${new Date(b.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline" className="text-[10px]">{b.stage.replace(/_/g, " ")}</Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(b.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
