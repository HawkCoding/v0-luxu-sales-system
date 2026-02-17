"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

export default function PaymentsPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const payments = data.payments.map((p: any) => {
    const job = data.jobs.find((j: any) => j.id === p.jobId)
    const customer = data.customers.find((c: any) => c.id === job?.customerId)
    return { ...p, jobNumber: job?.jobNumber, customerName: customer ? `${customer.firstName} ${customer.lastName}` : "Unknown" }
  }).sort((a: any, b: any) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())

  const filtered = payments.filter((p: any) => {
    if (!search) return true
    return [p.jobNumber, p.customerName, p.reference, p.method]
      .some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
  })

  const total = filtered.reduce((s: number, p: any) => s + p.amount, 0)

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} transactions &middot; Net: <span className={total >= 0 ? "text-payment-green" : "text-payment-red"}>R {total.toLocaleString()}</span></p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
      </div>

      <div className="space-y-2">
        {filtered.map((p: any) => (
          <Link key={p.id} href={`/app/jobs/${p.jobId}`}>
            <Card className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${p.amount >= 0 ? "text-payment-green" : "text-payment-red"}`}>
                        {p.amount >= 0 ? "+" : ""}R {p.amount.toLocaleString()}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{p.method}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {p.jobNumber} &middot; {p.customerName} &middot; Ref: {p.reference}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(p.receivedAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
