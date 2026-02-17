"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { useState } from "react"

export default function ProductsPage() {
  const { data, isLoading } = useAllData()
  const [search, setSearch] = useState("")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const rates = data.rateCards || []

  // Group by direction
  const grouped = rates.reduce((acc: Record<string, any[]>, r: any) => {
    if (!acc[r.direction]) acc[r.direction] = []
    acc[r.direction].push(r)
    return acc
  }, {})

  const directions = Object.keys(grouped).filter(d =>
    !search || d.toLowerCase().includes(search.toLowerCase()) || grouped[d].some((r: any) => r.suiteType.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Products & Rate Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">{rates.length} rate entries across {Object.keys(grouped).length} routes</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search routes or suites..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
      </div>

      <div className="space-y-4">
        {directions.map(dir => (
          <Card key={dir}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{dir}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ fontFamily: "var(--font-inter)" }}>
                  <thead>
                    <tr className="text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="pb-2">Suite Type</th>
                      <th className="pb-2 text-right">Price/Person</th>
                      <th className="pb-2 text-right">Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[dir].map((r: any, i: number) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-2 text-xs text-foreground">{r.suiteType}</td>
                        <td className="py-2 text-xs text-right text-foreground font-medium">R {r.pricePerPerson.toLocaleString()}</td>
                        <td className="py-2 text-xs text-right"><Badge variant="outline" className="text-[10px]">{r.currency}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
