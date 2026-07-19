"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Paperclip, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActiveSuppliers } from "@/lib/use-data"
import { EMAIL_ATTACHMENT_KINDS } from "@/lib/attachments/email-attachment-library"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"

interface LibraryEntry {
  id: string
  name: string
  fileName: string
  supplierId: string | null
  supplierName: string | null
  supplierKind: string | null
  emailKinds: string[]
}

interface EmailAttachmentLibraryEditorProps {
  canEdit: boolean
}

const ALL_SUPPLIERS = "__all__"
// Category options are prefixed so their values can never collide with a
// supplier UUID in the same dropdown.
const KIND_PREFIX = "kind:"

/** Map the selected dropdown value to the two scope columns (exactly one set, or both null). */
function scopeFromSelection(value: string): { supplierId: string | null; supplierKind: string | null } {
  if (value === ALL_SUPPLIERS) return { supplierId: null, supplierKind: null }
  if (value.startsWith(KIND_PREFIX)) {
    return { supplierId: null, supplierKind: value.slice(KIND_PREFIX.length) }
  }
  return { supplierId: value, supplierKind: null }
}

/** The dropdown value representing an entry's current scope. */
function selectionForEntry(entry: LibraryEntry): string {
  if (entry.supplierId) return entry.supplierId
  if (entry.supplierKind) return `${KIND_PREFIX}${entry.supplierKind}`
  return ALL_SUPPLIERS
}

export function EmailAttachmentLibraryEditor({ canEdit }: EmailAttachmentLibraryEditorProps) {
  const [entries, setEntries] = useState<LibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { data: suppliers } = useActiveSuppliers()

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/email-attachments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { attachments: LibraryEntry[] }) => {
        if (!cancelled) setEntries(d.attachments)
      })
      .catch(() => toast.error("Failed to load email attachments"))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/settings/email-attachments", {
        method: "POST",
        body: formData,
      })
      const body = (await res.json().catch(() => ({}))) as Partial<LibraryEntry> & {
        error?: string
      }
      if (!res.ok || !body.id) throw new Error(body.error)
      setEntries((current) => [
        ...current,
        {
          id: body.id as string,
          name: body.name ?? file.name,
          fileName: body.fileName ?? file.name,
          supplierId: body.supplierId ?? null,
          supplierName: null,
          supplierKind: body.supplierKind ?? null,
          emailKinds: body.emailKinds ?? [],
        },
      ])
      toast.success("File uploaded — now choose which emails it goes with")
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function patchEntry(
    id: string,
    updates: Partial<Pick<LibraryEntry, "name" | "supplierId" | "supplierKind" | "emailKinds">>,
  ) {
    const previous = entries
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)),
    )
    try {
      const res = await fetch(`/api/settings/email-attachments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error)
      }
    } catch (error) {
      setEntries(previous)
      toast.error(error instanceof Error && error.message ? error.message : "Could not save change")
    }
  }

  async function deleteEntry(id: string) {
    const previous = entries
    setEntries((current) => current.filter((entry) => entry.id !== id))
    try {
      const res = await fetch(`/api/settings/email-attachments/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error)
      }
      toast.success("Attachment removed")
    } catch (error) {
      setEntries(previous)
      toast.error(error instanceof Error && error.message ? error.message : "Could not remove attachment")
    }
  }

  function toggleKind(entry: LibraryEntry, kind: string, checked: boolean) {
    const emailKinds = checked
      ? [...entry.emailKinds, kind]
      : entry.emailKinds.filter((value) => value !== kind)
    void patchEntry(entry.id, { emailKinds })
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-4">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files yet. Upload the reservation form, suite layouts, fact sheets and other documents
          you attach to emails.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <Input
                  defaultValue={entry.name}
                  disabled={!canEdit}
                  maxLength={120}
                  aria-label={`Display name for ${entry.fileName}`}
                  className="h-8 w-56 text-sm"
                  onBlur={(event) => {
                    const name = event.target.value.trim()
                    if (name && name !== entry.name) void patchEntry(entry.id, { name })
                  }}
                />
                <Select
                  value={selectionForEntry(entry)}
                  onValueChange={(value) => void patchEntry(entry.id, scopeFromSelection(value))}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="h-8 w-52 text-sm" aria-label="Scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SUPPLIERS}>All trains / suppliers</SelectItem>
                    <SelectGroup>
                      <SelectLabel>Categories</SelectLabel>
                      {Object.entries(SUPPLIER_KIND_LABELS).map(([kind, label]) => (
                        <SelectItem key={kind} value={`${KIND_PREFIX}${kind}`}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {(suppliers ?? []).length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Suppliers</SelectLabel>
                        {(suppliers ?? []).map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{entry.fileName}</span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-7 w-7 text-muted-foreground"
                    onClick={() => void deleteEntry(entry.id)}
                    aria-label={`Remove ${entry.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-6">
                {EMAIL_ATTACHMENT_KINDS.map((kind) => (
                  <div key={kind.value} className="flex items-center gap-1.5">
                    <Checkbox
                      id={`kind-${entry.id}-${kind.value}`}
                      checked={entry.emailKinds.includes(kind.value)}
                      onCheckedChange={(checked) => toggleKind(entry, kind.value, checked === true)}
                      disabled={!canEdit}
                    />
                    <Label
                      htmlFor={`kind-${entry.id}-${kind.value}`}
                      className="cursor-pointer text-xs font-normal text-muted-foreground"
                    >
                      {kind.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit ? (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleUpload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3.5 w-3.5" />
            )}
            Upload file
          </Button>
          <span className="text-xs text-muted-foreground">
            Tick the emails each file should be pre-attached to. Scope a file to a category (e.g.
            Trains) or one supplier to limit where it appears.
          </span>
        </div>
      ) : null}
    </div>
  )
}
