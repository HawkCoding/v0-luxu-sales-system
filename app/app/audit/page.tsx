"use client"

import { useAllData } from "@/lib/use-data"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { useState } from "react"
import { useRole } from "@/lib/role-context"

export default function AuditPage() {
  const { data, isLoading } = useAllData()
  const { can } = useRole()
  const [search, setSearch] = useState("")

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-secondary rounded-lg" />)}</div></div>
  }

  const logs = [...data.auditLogs]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .filter((a: any) => {
      if (!search) return true
      return [a.action, a.entityType, a.actor, a.entityId]
        .some((f: string) => f?.toLowerCase().includes(search.toLowerCase()))
    })

  // Only show full details to managers
  const showMeta = can("view:full_audit")

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">{logs.length} entries</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search audit log..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
      </div>

      <div className="space-y-2">
        {logs.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{a.action.replace(/_/g, " ")}</span>
                    <Badge variant="secondary" className="text-[10px]">{a.entityType}</Badge>
                    <Badge variant="outline" className="text-[10px]">{a.actor}</Badge>
                    <span className="text-[10px] text-muted-foreground">{a.entityId}</span>
                  </div>
                  {showMeta && a.beforeJson && a.afterJson && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <code className="bg-secondary px-1 py-0.5 rounded text-[10px]">{a.beforeJson}</code>
                      <span>&rarr;</span>
                      <code className="bg-secondary px-1 py-0.5 rounded text-[10px]">{a.afterJson}</code>
                    </div>
                  )}
                  {showMeta && a.metaJson && (
                    <code className="text-[10px] text-muted-foreground mt-1 block bg-secondary px-1 py-0.5 rounded w-fit">{a.metaJson}</code>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
