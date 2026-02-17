"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Globe } from "lucide-react"
import { useState } from "react"

export default function CustomersPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const customers = data.customers.map((c: any) => {
    const jobCount = data.jobs.filter((j: any) => j.customerId === c.id).length
    return { ...c, jobCount }
  })

  const filtered = customers.filter((c: any) => {
    if (!search) return true
    return [c.firstName, c.lastName, c.email, c.phone, c.country]
      .some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
  })

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} customers</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
      </div>

      <div className="space-y-2">
        {filtered.map((c: any) => (
          <Card key={c.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-foreground" style={{ fontFamily: "var(--font-inter)" }}>
                      {c.firstName[0]}{c.lastName[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.firstName} {c.lastName}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email} &middot; {c.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Globe className="w-2.5 h-2.5" /> {c.country}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">{c.jobCount} jobs</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
