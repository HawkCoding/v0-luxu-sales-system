"use client"

import { useTemplates, useVoucherTemplate } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRole } from "@/lib/role-context"
import { useState } from "react"
import { Edit3, Eye, BookOpen } from "lucide-react"
import type { Template } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { VoucherTemplateEditor } from "@/components/voucher-template-editor"

const EMAIL_PLACEHOLDERS = [
  { token: "{{jobNumber}}",     description: "Job/booking reference number (e.g. BT-2026-0001)" },
  { token: "{{customerName}}", description: "Full name of the customer" },
  { token: "{{direction}}",     description: "Travel route direction" },
  { token: "{{departureDate}}", description: "Departure date of the trip" },
  { token: "{{validityDate}}", description: "Date the quote expires (14 days from issue)" },
  { token: "{{total}}",         description: "Total quoted price" },
  { token: "{{lastSentDate}}", description: "Date the quote was last sent to the customer" },
  { token: "{{depositAmount}}", description: "Deposit amount due (default 25% of total)" },
]

const VOUCHER_PLACEHOLDERS = [
  { token: "{voucher_number}",   description: "Unique voucher identifier" },
  { token: "{guest_names}",      description: "Names of all guests on the booking" },
  { token: "{consultant_name}",  description: "Name of the assigned consultant" },
  { token: "{supplier_name}",    description: "Name of the service supplier" },
  { token: "{route}",            description: "Route or itinerary name" },
  { token: "{departure}",        description: "Departure location and/or time" },
  { token: "{arrival}",          description: "Arrival location and/or time" },
  { token: "{suite_type}",       description: "Accommodation or transport suite type" },
  { token: "{number_of_guests}", description: "Total number of guests" },
  { token: "{special_requests}", description: "Any special requests from the customer" },
  { token: "{customer_email}",   description: "Customer's email address" },
  { token: "{customer_phone}",   description: "Customer's phone number" },
]

export default function TemplatesPage() {
  const { data: templates, isLoading, mutate } = useTemplates()
  const { data: voucherTemplate, isLoading: voucherLoading } = useVoucherTemplate()
  const { can } = useRole()
  const [editing, setEditing] = useState<Template | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Template | null>(null)
  const [showPlaceholders, setShowPlaceholders] = useState(false)

  if (isLoading || !templates) {
    return <div className="p-6"><div className="animate-pulse space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-secondary rounded-lg" />)}</div></div>
  }

  const startEdit = (t: Template) => {
    setEditing(t)
    setEditSubject(t.subject)
    setEditBody(t.bodyHtml)
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, subject: editSubject, bodyHtml: editBody }),
      })
      mutate()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Templates</h1>
          <p className="text-base text-muted-foreground mt-2">Email and voucher templates for customer communications</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowPlaceholders(true)}>
          <BookOpen className="w-4 h-4 mr-1.5" />
          Placeholder Names
        </Button>
      </div>

      <Tabs defaultValue="email" className="space-y-4">
        <TabsList>
          <TabsTrigger value="email">Email Templates</TabsTrigger>
          <TabsTrigger value="voucher">Voucher Template</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-3">
          {(templates as Template[]).map(t => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">{t.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">v{t.version}</Badge>
                    <Badge variant={t.active ? "default" : "outline"} className="text-[10px]">{t.active ? "Active" : "Inactive"}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreview(t)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {can("edit:templates") && (
                      <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground"><span className="font-medium">Subject:</span> {t.subject}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="voucher">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Voucher Template</CardTitle>
              <p className="text-sm text-muted-foreground">
                Customise the visual design and content of voucher PDFs sent to guests.
              </p>
            </CardHeader>
            <CardContent className="pb-20">
              {voucherLoading ? (
                <div className="animate-pulse space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-secondary rounded" />)}
                </div>
              ) : (
                <VoucherTemplateEditor
                  initial={voucherTemplate ?? VOUCHER_TEMPLATE_DEFAULTS}
                  canEdit={can("edit:templates")}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Email Template Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Modify the template subject and HTML body.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Body (HTML)</label>
              <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={12} className="mt-1 text-xs font-mono" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Email Template Dialog */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>{preview?.subject}</DialogDescription>
          </DialogHeader>
          <div className="border border-border rounded-md p-4 bg-card">
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: preview?.bodyHtml || "" }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Placeholder Names Reference Dialog */}
      <Dialog open={showPlaceholders} onOpenChange={setShowPlaceholders}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Placeholder Names</DialogTitle>
            <DialogDescription>
              Insert these tokens into your templates — they are replaced with live data when sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Email Templates <span className="font-normal normal-case">— double curly braces</span>
              </h3>
              <div className="space-y-2">
                {EMAIL_PLACEHOLDERS.map(p => (
                  <div key={p.token} className="flex items-start gap-3">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{p.token}</code>
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Voucher Template <span className="font-normal normal-case">— single curly braces</span>
              </h3>
              <div className="space-y-2">
                {VOUCHER_PLACEHOLDERS.map(p => (
                  <div key={p.token} className="flex items-start gap-3">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{p.token}</code>
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
