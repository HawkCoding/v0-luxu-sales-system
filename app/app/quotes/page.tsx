"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { formatDisplayDate } from "@/lib/date-format"

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  pricing_incomplete: { variant: "outline", label: "Pricing Incomplete" },
  ready: { variant: "default", label: "Ready" },
  sent: { variant: "default", label: "Sent" },
  accepted: { variant: "default", label: "Accepted" },
}

export default function QuotesPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-secondary rounded-lg" />)}</div></div>
  }

  const quotes = data.quotes.map((q: any) => {
    const booking = data.bookings.find((b: any) => b.id === q.bookingId)
    const customer = data.customers.find((c: any) => c.id === booking?.customerId)
    const itinerary = data.itineraries.find((i: any) => i.id === q.itineraryId)
    return { ...q, jobId: q.bookingId, jobNumber: booking?.bookingNumber, customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown", itineraryName: itinerary?.name }
  })

  const filtered = quotes.filter((q: any) => {
    const matchSearch = !search || [q.jobNumber, q.customerName, q.itineraryName].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === "all" || q.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-semibold text-foreground tracking-tight">Quotes</h1>
        <p className="text-base text-muted-foreground mt-2">{filtered.length} quotes</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search quotes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pricing_incomplete">Pricing Incomplete</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map((q: any) => {
          const badge = STATUS_BADGE[q.status] || { variant: "outline" as const, label: q.status }
          return (
            <Link key={q.id} href={`/app/bookings/${q.jobId}`}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground" style={{ fontFamily: "var(--font-inter)" }}>{q.quoteNumber || q.jobNumber}</span>
                        <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {q.customerName} {q.itineraryName ? `| ${q.itineraryName}` : ""}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-foreground">R {q.total.toLocaleString()}</p>
                      {q.validityUntil && (
                        <p className="text-xs text-muted-foreground">Valid: {formatDisplayDate(q.validityUntil)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
