"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { openIssuedDocument } from "@/components/issued-documents-section"
import type { Correspondence } from "@/lib/types"
import { Mail, AlertCircle, Clock, FileText } from "lucide-react"
import { formatDisplayDateTime } from "@/lib/date-format"
import { versionForCorrespondence } from "@/lib/documents/issued-documents"
import { useJobDocumentVersions } from "@/lib/use-data"

const STATUS_CONFIG: Record<string, { icon: typeof Mail; color: string }> = {
  sent: { icon: Mail, color: "text-payment-green" },
  failed: { icon: AlertCircle, color: "text-payment-red" },
  scheduled: { icon: Clock, color: "text-payment-yellow" },
}

// Manual email sending is disabled — all outbound mail is template/flow-driven.
// This tab is a read-only log; `jobId`/`mutate` stay in the props for the caller.
export function JobCorrespondenceTab({ correspondence, jobId }: { correspondence: Correspondence[]; jobId: string; mutate: () => void }) {
  // The copy of each quote, invoice or voucher an email carried, so the log can open exactly what the
  // client received. Absent for emails sent before copies were kept, and while loading.
  const { data: documentVersions } = useJobDocumentVersions(jobId)
  const versions = documentVersions?.versions ?? []

  return (
    <div className="space-y-4">
      {correspondence.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">No emails sent</div>
      ) : (
        <div className="space-y-2">
          {correspondence.map(c => {
            const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.sent
            const Icon = config.icon
            const sentCopy = versionForCorrespondence(versions, c.id)
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
                      {sentCopy ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 mt-1 text-xs"
                          onClick={() => void openIssuedDocument(sentCopy.id)}
                        >
                          <FileText className="w-3 h-3" aria-hidden />
                          View sent PDF
                        </Button>
                      ) : null}
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
