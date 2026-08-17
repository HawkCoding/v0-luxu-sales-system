"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Correspondence } from "@/lib/types"
import { Mail, AlertCircle, Clock } from "lucide-react"
import { formatDisplayDateTime } from "@/lib/date-format"

const STATUS_CONFIG: Record<string, { icon: typeof Mail; color: string }> = {
  sent: { icon: Mail, color: "text-payment-green" },
  failed: { icon: AlertCircle, color: "text-payment-red" },
  scheduled: { icon: Clock, color: "text-payment-yellow" },
}

// Manual email sending is disabled — all outbound mail is template/flow-driven.
// This tab is a read-only log; `jobId`/`mutate` stay in the props for the caller.
export function JobCorrespondenceTab({ correspondence }: { correspondence: Correspondence[]; jobId: string; mutate: () => void }) {
  return (
    <div className="space-y-4">
      {correspondence.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No emails sent</div>
      ) : (
        <div className="space-y-2">
          {correspondence.map(c => {
            const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.sent
            const Icon = config.icon
            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 ${config.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                        <Badge variant={c.status === "sent" ? "secondary" : c.status === "failed" ? "destructive" : "outline"} className="text-[10px] flex-shrink-0">
                          {c.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.sentAt ? `Sent: ${formatDisplayDateTime(c.sentAt)}` : c.scheduledAt ? `Scheduled: ${formatDisplayDateTime(c.scheduledAt)}` : ""}
                      </p>
                      {c.error && <p className="text-xs text-destructive mt-1">{c.error}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
