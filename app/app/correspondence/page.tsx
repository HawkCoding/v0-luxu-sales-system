"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Mail, AlertCircle, Clock } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

const STATUS_CONFIG: Record<string, { icon: typeof Mail; color: string }> = {
  sent: { icon: Mail, color: "text-payment-green" },
  failed: { icon: AlertCircle, color: "text-payment-red" },
  scheduled: { icon: Clock, color: "text-payment-yellow" },
}

export default function CorrespondencePage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const items = data.correspondences.map((c: any) => {
    const booking = data.bookings.find((b: any) => b.id === c.bookingId)
    const customer = data.customers.find((cu: any) => cu.id === booking?.customerId)
    return { ...c, jobId: c.bookingId, jobNumber: booking?.bookingNumber, customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown" }
  }).sort((a: any, b: any) => {
    const aDate = a.sentAt || a.scheduledAt || ""
    const bDate = b.sentAt || b.scheduledAt || ""
    return new Date(bDate).getTime() - new Date(aDate).getTime()
  })

  const filtered = items.filter((c: any) => {
    const matchSearch = !search || [c.subject, c.jobNumber, c.customerName].some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === "all" || c.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Correspondence</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} messages</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search correspondence..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {filtered.map((c: any) => {
          const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.sent
          const Icon = config.icon
          return (
            <Link key={c.id} href={`/app/jobs/${c.jobId}`}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={c.status === "sent" ? "secondary" : c.status === "failed" ? "destructive" : "outline"} className="text-[10px]">
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {c.jobNumber} &middot; {c.customerName}
                        {c.sentAt ? ` | Sent: ${new Date(c.sentAt).toLocaleString()}` : c.scheduledAt ? ` | Scheduled: ${new Date(c.scheduledAt).toLocaleString()}` : ""}
                      </p>
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
