"use client"

import Link from "next/link"
import { useActiveSuppliers, useTemplates, useVoucherTemplate } from "@/lib/use-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BufferedInput } from "@/components/ui/buffered-input"
import { SortableList } from "@/components/ui/sortable-list"
import { Skeleton } from "@/components/ui/skeleton"
import dynamic from "next/dynamic"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRole } from "@/lib/role-context"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Edit3, Eye, BookOpen, ChevronDown, ChevronRight, Mail, Plus, Trash2 } from "lucide-react"
import {
  getTokenSpecs,
  TEMPLATE_TOKENS,
  tokenGroup,
  type TemplateTokenGroup,
  type TemplateTokenSpec,
} from "@/lib/templates/registry"
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
import type { SupplierKind, Template } from "@/lib/types"

interface BookingSearchResult {
  id: string
  bookingNumber: string
  customerName: string
  departureDate: string | null
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDirtyCloseGuard } from "@/hooks/use-dirty-close-guard"
import { DiscardChangesDialog } from "@/components/discard-changes-dialog"
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
const EMAIL_PLACEHOLDERS: { token: string; description: string; group: TemplateTokenGroup }[] = (() => {
  const seen = new Map<string, TemplateTokenSpec>()
  for (const specs of Object.values(TEMPLATE_TOKENS)) {
    for (const spec of specs) {
      if (!seen.has(spec.name)) seen.set(spec.name, spec)
    }
  }
  return [...seen.values()].map((spec) => ({
    token: `{{${spec.name}}}`,
    description: spec.description,
    group: tokenGroup(spec),
  }))
})()

const GROUP_HEADINGS: Record<TemplateTokenGroup, string> = {
  always: "Always available",
  rail: "Journeys — trains",
  stay: "Stays — properties",
}

interface TokenChipsProps {
  specs: TemplateTokenSpec[]
  /** Kind of the supplier this variant is for, or null for the untagged parent template. */
  supplierKind: SupplierKind | null
  onInsert: (name: string) => void
}

/**
 * Token chips, grouped by the product they describe. Nothing is ever hidden: the group that does
 * not match the template's supplier is collapsed behind a count, one click from view. A hotel
 * variant (Kruger Shalati) opens on the stay tokens, everything else on the rail ones -- so an
 * author writes {{checkInDate}} rather than reaching for {{departureDate}} because it was the only
 * date token in front of them.
 */
function TokenChips({ specs, supplierKind, onInsert }: TokenChipsProps) {
  const relevant: TemplateTokenGroup = supplierKind === "hotel_property" ? "stay" : "rail"
  const [expanded, setExpanded] = useState<TemplateTokenGroup | null>(relevant)

  const byGroup = new Map<TemplateTokenGroup, TemplateTokenSpec[]>()
  for (const spec of specs) {
    const group = tokenGroup(spec)
    byGroup.set(group, [...(byGroup.get(group) ?? []), spec])
  }
  // Always first, then whichever of rail/stay this template is actually for.
  const order: TemplateTokenGroup[] = ["always", relevant, relevant === "stay" ? "rail" : "stay"]

  const chips = (group: TemplateTokenGroup) => (
    <div className="flex flex-wrap gap-1.5">
      {(byGroup.get(group) ?? []).map((spec) => (
        <button
          key={spec.name}
          type="button"
          title={spec.description}
          onClick={() => onInsert(spec.name)}
          className="text-xs font-mono bg-muted hover:bg-accent px-1.5 py-0.5 rounded border border-border focus-visible:outline-2 focus-visible:outline-ring"
        >
          {`{{${spec.name}}}`}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Available tokens — click to insert</p>
      {order.map((group) => {
        const groupSpecs = byGroup.get(group) ?? []
        if (groupSpecs.length === 0) return null
        // "always" is the shared vocabulary — collapsing it would hide the customer's own name.
        const collapsible = group !== "always"
        const isOpen = !collapsible || expanded === group
        return (
          <div key={group}>
            {collapsible ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : group)}
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring rounded"
              >
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {GROUP_HEADINGS[group]}
                <span className="font-normal normal-case">({groupSpecs.length})</span>
              </button>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {GROUP_HEADINGS[group]}
              </p>
            )}
            {isOpen && chips(group)}
          </div>
        )
      })}
    </div>
  )
}

export default function TemplatesPage() {
  const { data: templates, isLoading, mutate } = useTemplates()
  const { data: voucherTemplate, isLoading: voucherLoading } = useVoucherTemplate()
  const { data: suppliers } = useActiveSuppliers()
  const { can } = useRole()
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
  const [bookingQuery, setBookingQuery] = useState("")
  const [bookingResults, setBookingResults] = useState<BookingSearchResult[]>([])
  const [selectedBooking, setSelectedBooking] = useState<{ id: string; label: string } | null>(null)
  const [orderedTemplates, setOrderedTemplates] = useState<Template[]>([])
  const [addingVariantFor, setAddingVariantFor] = useState<Template | null>(null)
  const [variantSupplierId, setVariantSupplierId] = useState("")
  const [creatingVariant, setCreatingVariant] = useState(false)

  useEffect(() => {
    if (templates) setOrderedTemplates(templates as Template[])
  }, [templates])

  // Server-render a branded preview whenever a template is opened for preview
  // (or a booking is picked/cleared); uses real booking data when selected,
  // sample token values otherwise. Falls back to the raw body if the request fails.
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
      body: JSON.stringify({
        key: preview.key,
        subject: preview.subject,
        bodyHtml: preview.bodyHtml,
        bookingId: selectedBooking?.id,
      }),
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
  }, [preview, selectedBooking?.id])

  const searchBookings = async () => {
    const response = await fetch(`/api/bookings/search?q=${encodeURIComponent(bookingQuery)}`)
    if (!response.ok) return
    const body = (await response.json()) as { bookings: BookingSearchResult[] }
    setBookingResults(body.bookings)
  }

  const closePreview = () => {
    setPreview(null)
    setBookingQuery("")
    setBookingResults([])
    setSelectedBooking(null)
  }

  const isEditDirty = editing !== null && (editSubject !== editing.subject || editBody !== editing.bodyHtml)
  const editCloseGuard = useDirtyCloseGuard({
    isDirty: isEditDirty,
    onConfirmedClose: () => setEditing(null),
  })
  const isCreateDirty =
    createName.trim() !== "" || createSubject.trim() !== "" || createBody.trim() !== ""
  const createCloseGuard = useDirtyCloseGuard({
    isDirty: isCreateDirty,
    onConfirmedClose: () => setCreating(false),
  })

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
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, subject: editSubject, bodyHtml: editBody }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to save template")
        return
      }
      toast.success("Template saved")
      mutate()
      setEditing(null)
    } catch {
      toast.error("Failed to save template")
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

  const handleRenameLocal = (id: string, name: string) => {
    setOrderedTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)))
  }

  const commitRename = async (id: string) => {
    const current = orderedTemplates.find((t) => t.id === id)
    const original = (templates as Template[]).find((t) => t.id === id)
    if (!current || !original || current.name === original.name) return
    const name = current.name.trim()
    if (!name) {
      handleRenameLocal(id, original.name)
      return
    }
    try {
      const res = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to rename template")
        handleRenameLocal(id, original.name)
        return
      }
      mutate()
    } catch {
      toast.error("Failed to rename template")
      handleRenameLocal(id, original.name)
    }
  }

  const handleReorder = async (orderedIds: string[]) => {
    const byId = new Map(orderedTemplates.map((t) => [t.id, t]))
    const next = orderedIds.flatMap((id, index) => {
      const t = byId.get(id)
      return t ? [{ ...t, sortOrder: index }] : []
    })
    setOrderedTemplates(next)
    const changed = next.filter((t, index) => {
      const original = (templates as Template[]).find((o) => o.id === t.id)
      return original && original.sortOrder !== index
    })
    try {
      const results = await Promise.all(
        changed.map((t) =>
          fetch("/api/templates", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: t.id, sortOrder: t.sortOrder }),
          }),
        ),
      )
      if (results.some((res) => !res.ok)) {
        toast.error("Failed to save new template order")
      }
      mutate()
    } catch {
      toast.error("Failed to save new template order")
      mutate()
    }
  }

  // Per-supplier variants (e.g. a Rovos-specific quote_email body, or a Kruger Shalati one) reuse
  // their parent's system key, distinguished only by supplierId. SortableList drags parents only --
  // a variant's position is fixed under its parent card, so it is filtered out of the draggable
  // list and grouped by key.
  const parentTemplates = orderedTemplates.filter((t) => !t.supplierId)
  const variantsByKey = new Map<string, Template[]>()
  for (const t of orderedTemplates) {
    if (!t.supplierId) continue
    const list = variantsByKey.get(t.key) ?? []
    list.push(t)
    variantsByKey.set(t.key, list)
  }
  for (const list of variantsByKey.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name))
  }
  const supplierNameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]))
  // Drives which token group the editor opens on -- a stay variant leads with check-in/meal plan,
  // a train variant with route/departure.
  const supplierKindById = new Map((suppliers ?? []).map((s) => [s.id, s.kind]))
  // Any supplier that may head a booking of its own (trains, and standalone stays like Kruger
  // Shalati) may carry a variant -- not just trains.
  const primarySuppliers = (suppliers ?? [])
    .filter((s) => s.sellsStandalone)
    .sort((a, b) => a.name.localeCompare(b.name))

  const openAddVariant = (parent: Template) => {
    setAddingVariantFor(parent)
    setVariantSupplierId("")
  }

  const handleCreateVariant = async () => {
    if (!addingVariantFor || !variantSupplierId) return
    const supplierName = supplierNameById.get(variantSupplierId) ?? "Supplier"
    setCreatingVariant(true)
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: addingVariantFor.key,
          supplierId: variantSupplierId,
          name: `${addingVariantFor.name} — ${supplierName}`,
          subject: addingVariantFor.subject,
          bodyHtml: addingVariantFor.bodyHtml,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Failed to create variant")
        return
      }
      toast.success(`${supplierName} variant created — starts as a copy, edit it to diverge`)
      mutate()
      setAddingVariantFor(null)
      setVariantSupplierId("")
    } catch {
      toast.error("Failed to create variant")
    } finally {
      setCreatingVariant(false)
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

      <Tabs defaultValue="emails" className="space-y-4">
        <TabsList>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="guest-docs">Voucher Design</TabsTrigger>
          <TabsTrigger value="billing-docs">Quote &amp; Invoice</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="space-y-3">
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

          <SortableList
            items={parentTemplates}
            onReorder={handleReorder}
            disabled={!can("edit:templates")}
            renderItem={({ item: t, dragHandle }) => (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {can("edit:templates") && dragHandle}
                      {can("edit:templates") ? (
                        <BufferedInput
                          value={t.name}
                          onValueChange={(value) => handleRenameLocal(t.id, value)}
                          onBlur={() => commitRename(t.id)}
                          className="h-7 max-w-xs text-sm font-medium"
                        />
                      ) : (
                        <CardTitle className="text-sm font-medium">{t.name}</CardTitle>
                      )}
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
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground"><span className="font-medium">Subject:</span> {t.subject}</p>

                  {t.isSystem && (
                    <div className="space-y-2 border-l-2 pl-3">
                      {(variantsByKey.get(t.key) ?? []).map((variant) => (
                        <div key={variant.id} className="flex items-center justify-between gap-2 rounded-md bg-secondary/40 px-2.5 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium truncate">
                              {supplierNameById.get(variant.supplierId ?? "") ?? "Unknown supplier"}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">v{variant.version}</Badge>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => setPreview(variant)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {can("edit:templates") && (
                              <Button variant="ghost" size="sm" onClick={() => startEdit(variant)}>
                                <Edit3 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {can("edit:templates") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingDelete(variant)}
                                aria-label={`Delete ${supplierNameById.get(variant.supplierId ?? "") ?? "supplier"} variant`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {can("edit:templates") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openAddVariant(t)}>
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add variant
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          />

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
              <EmailAttachmentLibraryEditor canEdit={can("edit:settings")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Email Signature</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                Division brand templates (banner, badges, legal text) for the outgoing-email
                signature. Any salesperson can pick which brand to send with.
              </p>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link href="/app/settings/email-signatures">
                  <Mail className="h-4 w-4" />
                  Manage Email Signatures
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guest-docs" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Voucher Design</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Visual design and layout of the voucher PDF sent to guests.
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Voucher &amp; Itinerary Wording</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                Text rendered into the voucher and itinerary PDFs handed to guests.
              </p>
            </CardHeader>
            <CardContent className="pb-6">
              <DocumentTextSettingsEditor
                canEdit={can("edit:templates")}
                groups={["Voucher document", "Itinerary document"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing-docs" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">Quote &amp; Invoice Wording</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    Text rendered into the quote and invoice PDFs.
                  </p>
                </div>
                {can("edit:templates") && <PdfPreviewButtons types={["quote", "invoice"]} />}
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              <DocumentTextSettingsEditor
                canEdit={can("edit:templates")}
                groups={["Quote document", "Invoice document"]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Brand Block</CardTitle>
              <p className="text-sm text-muted-foreground mt-1.5">
                The SARAIL seal and heading shown across every outgoing email and on
                quote, invoice and voucher PDFs. Choose top or bottom placement per document.
              </p>
            </CardHeader>
            <CardContent className="pb-6">
              <BrandBlockSettingsEditor canEdit={can("edit:settings")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Email Template Dialog */}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => (open ? undefined : editCloseGuard.handleOpenChange(false))}
      >
        <DialogContent className="max-w-2xl" {...editCloseGuard.contentProps}>
          <DiscardChangesDialog
            open={editCloseGuard.confirming}
            onKeepEditing={editCloseGuard.cancelDiscard}
            onDiscard={editCloseGuard.confirmDiscard}
          />
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
              // Keyed on the template so switching templates re-derives which group opens first
              // rather than carrying the previous one's expansion across.
              <TokenChips
                key={editing.id}
                specs={getTokenSpecs(editing.key)}
                supplierKind={
                  (editing.supplierId ? supplierKindById.get(editing.supplierId) : null) ?? null
                }
                onInsert={(name) => setEditBody((b) => `${b}{{${name}}}`)}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => editCloseGuard.handleOpenChange(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || editSubject.trim().length < 1}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Variant Dialog */}
      <Dialog open={!!addingVariantFor} onOpenChange={(open) => !open && setAddingVariantFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add variant</DialogTitle>
            <DialogDescription>
              {addingVariantFor
                ? `Starts as a copy of "${addingVariantFor.name}" — edit it afterwards to diverge in wording. A supplier with no variant of its own keeps using the shared template.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Supplier</label>
              <Select value={variantSupplierId} onValueChange={setVariantSupplierId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a supplier" />
                </SelectTrigger>
                <SelectContent>
                  {primarySuppliers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No standalone suppliers found. Tick &ldquo;Sold as a standalone booking&rdquo; on a
                      supplier first.
                    </div>
                  ) : (
                    primarySuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddingVariantFor(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateVariant} disabled={creatingVariant || !variantSupplierId}>
                {creatingVariant ? "Adding..." : "Add variant"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Email Template Dialog */}
      <Dialog
        open={creating}
        onOpenChange={(open) => (open ? undefined : createCloseGuard.handleOpenChange(false))}
      >
        <DialogContent className="max-w-2xl" {...createCloseGuard.contentProps}>
          <DiscardChangesDialog
            open={createCloseGuard.confirming}
            onKeepEditing={createCloseGuard.cancelDiscard}
            onDiscard={createCloseGuard.confirmDiscard}
          />
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
              <Button variant="outline" size="sm" onClick={() => createCloseGuard.handleOpenChange(false)}>Cancel</Button>
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
                ? `“${pendingDelete.name}” will be permanently removed. This cannot be undone.`
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
      <Dialog open={!!preview} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
            <DialogDescription>{preview?.subject}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="preview-booking-search">Preview with real booking data</Label>
            <div className="flex gap-2">
              <Input
                id="preview-booking-search"
                value={bookingQuery}
                onChange={(event) => setBookingQuery(event.target.value)}
                placeholder="Booking number or customer name"
              />
              <Button type="button" variant="outline" onClick={searchBookings}>Search</Button>
            </div>
            {bookingResults.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {bookingResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      setSelectedBooking({ id: result.id, label: `${result.bookingNumber} — ${result.customerName}` })
                      setBookingResults([])
                    }}
                    className="w-full rounded-md border px-3 py-1.5 text-left text-sm hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-medium">{result.bookingNumber}</span>{" "}
                    <span className="text-muted-foreground">{result.customerName}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {selectedBooking ? (
                <>
                  Showing real data for {selectedBooking.label}.{" "}
                  <button type="button" className="underline" onClick={() => setSelectedBooking(null)}>
                    Use sample data
                  </button>
                </>
              ) : (
                "Showing sample data."
              )}
            </p>
          </div>
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
            {(["always", "rail", "stay"] as TemplateTokenGroup[]).map((group) => {
              const entries = EMAIL_PLACEHOLDERS.filter((p) => p.group === group)
              if (entries.length === 0) return null
              return (
                <div key={group}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {GROUP_HEADINGS[group]}{" "}
                    {group === "always" && (
                      <span className="font-normal normal-case">— double curly braces</span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {entries.map((p) => (
                      <div key={p.token} className="flex items-start gap-3">
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{p.token}</code>
                        <span className="text-xs text-muted-foreground">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
