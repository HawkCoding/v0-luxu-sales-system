"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { AuditLog } from "@/lib/types"
import { formatDisplayDateTime } from "@/lib/date-format"
import { getAuditDisplay, isDuplicateStageUpdate, type AuditDisplayContext } from "@/lib/audit-display"
import { Activity } from "lucide-react"

interface JobAuditTabProps {
  auditLogs: AuditLog[]
  context?: AuditDisplayContext
}

export function JobAuditTab({ auditLogs, context }: JobAuditTabProps) {
  if (auditLogs.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">No audit entries</div>
  }

  const sorted = [...auditLogs]
    .filter((log) => !isDuplicateStageUpdate(log, auditLogs))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className="space-y-3">
      {sorted.map(a => {
        const display = getAuditDisplay(a, context)

        return (
        <Card key={a.id} className="border-l-4 border-l-primary/70">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-foreground">{display.title}</p>
                  {display.description && display.description !== "Stage change" && (
                    <p className="mt-1 text-sm text-muted-foreground">{display.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{a.entityType}</Badge>
                    <Badge variant="outline" className="text-[10px]">{display.actorLabel}</Badge>
                    <Badge variant="outline" className="text-[10px]">{a.action.replace(/_/g, " ")}</Badge>
                  </div>
                  {a.metaJson && (
                    <p className="text-xs text-muted-foreground mt-0.5">{a.metaJson}</p>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                {formatDisplayDateTime(a.createdAt)}
              </span>
            </div>
          </CardContent>
        </Card>
        )
      })}
    </div>
  )
}
