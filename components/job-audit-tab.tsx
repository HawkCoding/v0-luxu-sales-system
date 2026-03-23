"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { AuditLog } from "@/lib/types"

export function JobAuditTab({ auditLogs }: { auditLogs: AuditLog[] }) {
  if (auditLogs.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No audit entries</div>
  }

  const sorted = [...auditLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="space-y-2">
      {sorted.map(a => (
        <Card key={a.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{a.action.replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-[10px]">{a.entityType}</Badge>
                  <Badge variant="outline" className="text-[10px]">{a.actor}</Badge>
                </div>
                {a.beforeJson && a.afterJson && (
                  <div className="mt-1.5 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{a.beforeJson}</span>
                    <span className="text-muted-foreground">&rarr;</span>
                    <span className="text-foreground">{a.afterJson}</span>
                  </div>
                )}
                {a.metaJson && (
                  <p className="text-xs text-muted-foreground mt-0.5">{a.metaJson}</p>
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
  )
}
