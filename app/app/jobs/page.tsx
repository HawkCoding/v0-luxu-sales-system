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

  const enriched = data.jobs.map((j: any) => {
    const customer = data.customers.find((c: any) => c.id === j.customerId)
    const enquiry = data.enquiries.find((e: any) => e.jobId === j.id)
    const payments = data.payments.filter((p: any) => p.jobId === j.id)
    const quotes = data.quotes.filter((q: any) => q.jobId === j.id)
    const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0)
    const quoteTotal = quotes.reduce((s: number, q: any) => Math.max(s, q.total), 0) || 1
    let paymentColor = "red"
    if (totalPaid < 0) paymentColor = "blue"
    else if (totalPaid >= quoteTotal && totalPaid > 0) paymentColor = "green"
    else if (totalPaid >= quoteTotal * 0.25) paymentColor = "yellow"
    else if (totalPaid > 0) paymentColor = "purple"
    return {
      ...j,
      customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown",
      direction: enquiry?.direction || "",
      departureDate: enquiry?.departureDate || "",
      paymentColor,
      totalPaid,
    }
  })

  const filtered = enriched.filter((j: any) => {
    const matchSearch = !search || [j.jobNumber, j.customerName, j.direction].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStage = stageFilter === "all" || j.stage === stageFilter
    return matchSearch && matchStage
  })

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} jobs</p>
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
        {filtered.map((j: any) => (
          <Link key={j.id} href={`/app/jobs/${j.id}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PAYMENT_COLORS[j.paymentColor] || "bg-muted-foreground"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-inter)" }}>{j.jobNumber}</span>
                        <span className="text-xs text-muted-foreground">{j.customerName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {j.direction}{j.departureDate ? ` | Dep: ${new Date(j.departureDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Badge variant="outline" className="text-[10px]">{j.stage.replace(/_/g, " ")}</Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(j.updatedAt).toLocaleDateString()}</p>
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
