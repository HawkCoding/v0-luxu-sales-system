"use client"

import { useTemplates, useVoucherTemplate } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRole } from "@/lib/role-context"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Edit3, Eye, BookOpen, Plus, Trash2 } from "lucide-react"
import { getTokenSpecs, TEMPLATE_TOKENS, type TemplateTokenSpec } from "@/lib/templates/registry"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Template } from "@/lib/types"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"
import { VoucherTemplateEditor } from "@/components/voucher-template-editor"
import { BrandBlockSettingsEditor } from "@/components/brand-block-settings-editor"
import { DocumentTextSettingsEditor } from "@/components/document-text-settings-editor"
import { EmailAppearanceSettingsEditor } from "@/components/email-appearance-settings-editor"
import { EmailAttachmentLibraryEditor } from "@/components/email-attachment-library-editor"
import { PdfPreviewButtons } from "@/components/pdf-preview-buttons"

const HtmlBodyEditor = dynamic(
  () => import("@/components/ui/html-body-editor").then((m) => m.HtmlBodyEditor),
  { ssr: false, loading: () => <Skeleton className="min-h-64" /> },
)

// Block-kind tokens for a template key ({{quoteSummaryTable}}, {{bankingDetails}})
// must be treated as opaque blocks so they serialize back at block level.
function blockTokensFor(key: string): string[] {
  return getTokenSpecs(key)
    .filter((s) => s.kind === "block")
    .map((s) => s.name)
}

// Custom templates have no registry entry, so offer every known block token —
// a user hand-typing {{bankingDetails}} still gets block treatment.
const ALL_BLOCK_TOKENS: string[] = (() => {
  const set = new Set<string>()
  for (const specs of Object.values(TEMPLATE_TOKENS)) {
    for (const spec of specs) if (spec.kind === "block") set.add(spec.name)
  }
  return [...set]
})()

// Union of all system-template tokens for the reference dialog — the token
// registry (lib/templates/registry.ts) is the source of truth.
const EMAIL_PLACEHOLDERS: { token: string; description: string }[] = (() => {
  const seen = new Map<string, string>()
  for (const specs of Object.values(TEMPLATE_TOKENS)) {
    for (const spec of specs) {
      if (!seen.has(spec.name)) seen.set(spec.name, spec.description)
    }
  }
  return [...seen.entries()].map(([name, description]) => ({ token: `{{${name}}}`, description }))
})()

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
  const { can, role } = useRole()
  const [editing, setEditing] = useState<Template | null>(null)
  const [editSubject, setEditSubject] = useState("")
  const [editBody, setEditBody] = useState("")
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Template | null>(null)
  const [showPlaceholders, setShowPlaceholders] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createSubject, setCreateSubject] = useState("")
  const [createBody, setCreateBody] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  // Server-render a branded preview (sample token values) whenever a template
  // is opened for preview; fall back to the raw body if the request fails.
  useEffect(() => {
    if (!preview) {
      setPreviewHtml(null)
      setPreviewWarnings([])
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    fetch("/api/templates/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: preview.key, subject: preview.subject, bodyHtml: preview.bodyHtml }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("preview failed"))))
      .then((d: { html?: string; warnings?: string[] }) => {
        if (cancelled) return
        setPreviewHtml(typeof d.html === "string" ? d.html : null)
        setPreviewWarnings(Array.isArray(d.warnings) ? d.warnings : [])
      })
      .catch(() => {
        if (!cancelled) setPreviewHtml(null)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [preview])

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

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, subject: createSubject, bodyHtml: createBody }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to create template")
        return
      }
      toast.success("Template created")
      mutate()
      setCreating(false)
      setCreateName("")
      setCreateSubject("")
      setCreateBody("")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/templates/${pendingDelete.id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to delete template")
        return
      }
      toast.success("Template deleted")
      mutate()
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">Templates</h1>
          <p className="text-base text-muted-foreground mt-2">Email and voucher templates for customer communications</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPlaceholders(true)}>
            <BookOpen className="w-4 h-4 mr-1.5" />
            Placeholder Names
          </Button>
          {can("edit:templates") && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              New Template
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="email" className="space-y-4">
        <TabsList>
          <TabsTrigger value="email">Email Templates</TabsTrigger>
          <TabsTrigger value="voucher">Voucher Template</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Email Appearance</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                Font used for every outgoing email. Applies to all templates below.
              </p>
            </CardHeader>
            <CardContent>
              <EmailAppearanceSettingsEditor canEdit={can("edit:templates")} />
            </CardContent>
          </Card>

          {(templates as Template[]).map(t => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">{t.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">v{t.version}</Badge>
                    <Badge variant={t.active ? "default" : "outline"} className="text-[10px]">{t.active ? "Active" : "Inactive"}</Badge>
                    {t.isSystem && <Badge variant="outline" className="text-[10px]">System</Badge>}
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
                    {can("edit:templates") && !t.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(t)}
                        aria-label={`Delete ${t.key} template`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
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
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Voucher Template</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Customise the visual design and content of voucher PDFs sent to guests.
                  </p>
                </div>
                {can("edit:templates") && <PdfPreviewButtons types={["voucher", "itinerary"]} />}
              </div>
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

        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Brand Block</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                The SARAIL seal and heading shown on quotes, invoices, vouchers and
                emails. Choose top or bottom placement per document.
              </p>
            </CardHeader>
            <CardContent className="pb-6">
              <BrandBlockSettingsEditor canEdit={role === "admin"} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Document Wording</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Customise the wording rendered into quote, voucher, invoice, and itinerary PDFs.
                  </p>
                </div>
                {can("edit:templates") && <PdfPreviewButtons />}
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              <DocumentTextSettingsEditor canEdit={can("edit:templates")} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Email Attachments</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                Reusable files (reservation form, suite layouts, fact sheets) offered as tick-box
                attachments when sending emails. Scope a file to a supplier category or a single
                supplier to limit where it appears.
              </p>
            </CardHeader>
            <CardContent className="pb-6">
              <EmailAttachmentLibraryEditor canEdit={role === "admin" || role === "manager"} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Email Template Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>Modify the template subject and body.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Body</label>
              <div className="mt-1">
                <HtmlBodyEditor
                  value={editBody}
                  onChange={setEditBody}
                  blockTokens={editing ? blockTokensFor(editing.key) : ALL_BLOCK_TOKENS}
                />
              </div>
            </div>
            {editing && getTokenSpecs(editing.key).length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Available tokens — click to insert
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {getTokenSpecs(editing.key).map((spec: TemplateTokenSpec) => (
                    <button
                      key={spec.name}
                      type="button"
                      title={spec.description}
                      onClick={() => setEditBody((b) => `${b}{{${spec.name}}}`)}
                      className="text-xs font-mono bg-muted hover:bg-accent px-1.5 py-0.5 rounded border border-border focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {`{{${spec.name}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Email Template Dialog */}
      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Template</DialogTitle>
            <DialogDescription>Create a custom email template. Use placeholder tokens for live data.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Welcome Email"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Input value={createSubject} onChange={(e) => setCreateSubject(e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Body</label>
              <div className="mt-1">
                <HtmlBodyEditor value={createBody} onChange={setCreateBody} blockTokens={ALL_BLOCK_TOKENS} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={saving || createName.trim().length < 2 || createSubject.trim().length < 1}
              >
                {saving ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `“${pendingDelete.key.replace(/_/g, " ")}” will be permanently removed. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Email Template Dialog */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>{preview?.subject}</DialogDescription>
          </DialogHeader>
          {previewWarnings.length > 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-500 space-y-0.5" role="alert">
              {previewWarnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          <div className="border border-border rounded-md bg-card overflow-hidden">
            {/* Sandboxed iframe (no scripts, no same-origin) so template HTML cannot run in the app's session */}
            {previewLoading ? (
              <div className="w-full h-72 animate-pulse bg-secondary" />
            ) : (
              <iframe
                title="Template preview"
                sandbox=""
                srcDoc={previewHtml ?? preview?.bodyHtml ?? ""}
                className="w-full h-96 border-0 bg-white"
              />
            )}
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
