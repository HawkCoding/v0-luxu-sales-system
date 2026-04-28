"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import type { Correspondence } from "@/lib/types"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Send, Mail, AlertCircle, Clock } from "lucide-react"
import { formatDisplayDateTime } from "@/lib/date-format"

const STATUS_CONFIG: Record<string, { icon: typeof Mail; color: string }> = {
  sent: { icon: Mail, color: "text-payment-green" },
  failed: { icon: AlertCircle, color: "text-payment-red" },
  scheduled: { icon: Clock, color: "text-payment-yellow" },
}

export function JobCorrespondenceTab({ correspondence, jobId, mutate }: { correspondence: Correspondence[]; jobId: string; mutate: () => void }) {
  const { can } = useRole()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    setSending(true)
    try {
      await fetch("/api/correspondence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, subject, bodyHtml: `<p>${body.replace(/\n/g, "</p><p>")}</p>` }),
      })
      mutate()
      setOpen(false)
      setSubject("")
      setBody("")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      {can("send:correspondence") && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Send className="w-4 h-4 mr-1.5" /> Send Email</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Compose Email</DialogTitle>
                <DialogDescription>Send an email to the customer for this job.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Subject</label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Body</label>
                  <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-1 text-sm" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleSend} disabled={sending || !subject}>
                    {sending ? "Sending..." : "Send"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

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
