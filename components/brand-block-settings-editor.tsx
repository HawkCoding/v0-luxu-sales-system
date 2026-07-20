"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MAX_IMAGE_MB } from "@/lib/upload-limits"
import { useDocumentBrandSettings, type DocumentBrandSettings } from "@/lib/use-data"

interface BrandBlockSettingsEditorProps {
  canEdit: boolean
}

const POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "hidden", label: "Hidden" },
]

type TextKey = "brand_block_heading" | "brand_block_subheading"

const TEXT_FIELDS: { key: TextKey; label: string; placeholder: string }[] = [
  {
    key: "brand_block_heading",
    label: "Heading",
    placeholder: "A division of Luxus Travel & Tours",
  },
  {
    key: "brand_block_subheading",
    label: "Sub-heading",
    placeholder: "BLUE TRAIN | ROVOS RAIL | KRUGER SHALATI",
  },
]

export function BrandBlockSettingsEditor({ canEdit }: BrandBlockSettingsEditorProps) {
  const { data, isLoading, error, mutate } = useDocumentBrandSettings()
  const [values, setValues] = useState<Partial<DocumentBrandSettings>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (data) setValues(data)
  }, [data])

  const patch = async (payload: Partial<DocumentBrandSettings>, label: string, key: string) => {
    setSavingKey(key)
    try {
      const res = await fetch("/api/settings/document-brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      toast.success(`${label} saved`)
      mutate()
    } catch {
      toast.error(`Failed to save ${label.toLowerCase()}`)
    } finally {
      setSavingKey(null)
    }
  }

  const handleUpload = async (file: File) => {
    if (file.type !== "image/png") {
      toast.error("The logo must be a PNG image.")
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/settings/brand-logo", { method: "POST", body })
      if (!res.ok) {
        const { error: message } = await res.json().catch(() => ({ error: "" }))
        throw new Error(message || "upload failed")
      }
      const { url } = (await res.json()) as { url: string }
      setValues((v) => ({ ...v, brand_block_logo_url: url }))
      toast.success("Logo uploaded")
      mutate()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to upload logo")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load brand block settings. Refresh to try again.
      </p>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-secondary rounded" />
        ))}
      </div>
    )
  }

  const logoUrl = values.brand_block_logo_url

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        The SARAIL brand block — seal, heading and sub-heading — shown on quotes,
        invoices, emails and vouchers. Choose where it sits on the PDF documents
        and on emails below; vouchers and itineraries always carry it in their
        header.
      </p>

      {/* Logo */}
      <div className="space-y-2">
        <Label htmlFor="brand-logo-input">Logo (PNG)</Label>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded border bg-secondary/40">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Brand logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-muted-foreground">No logo</span>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col gap-1">
              <input
                id="brand-logo-input"
                ref={fileInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleUpload(file)
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload logo"}
              </Button>
              <span className="text-[10px] text-muted-foreground">
                Square PNG, max {MAX_IMAGE_MB} MB.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Heading + sub-heading */}
      {TEXT_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label htmlFor={field.key}>{field.label}</Label>
          <div className="flex items-start gap-2">
            <Input
              id={field.key}
              value={values[field.key] ?? ""}
              placeholder={field.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
              readOnly={!canEdit}
              className="text-sm"
            />
            {canEdit && (
              <Button
                size="sm"
                disabled={savingKey === field.key || !values[field.key]?.trim()}
                onClick={() =>
                  patch({ [field.key]: values[field.key]?.trim() }, field.label, field.key)
                }
              >
                {savingKey === field.key ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      ))}

      {/* Brand block placement — PDFs (quote + invoice together) and emails */}
      <div className="space-y-1">
        <p className="text-sm font-medium">Brand block placement</p>
        <p className="text-xs text-muted-foreground">
          Where the brand block sits on the quote and invoice PDFs, and on
          emails.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* One control drives both PDF documents so they stay consistent. */}
        <div className="space-y-1">
          <Label htmlFor="brand_block_position_pdf">PDF position</Label>
          <Select
            value={values.brand_block_position_invoice ?? "top"}
            disabled={!canEdit || savingKey === "pdf_position"}
            onValueChange={(value) => {
              setValues((v) => ({
                ...v,
                brand_block_position_quote: value,
                brand_block_position_invoice: value,
              }))
              void patch(
                {
                  brand_block_position_quote: value,
                  brand_block_position_invoice: value,
                },
                "PDF position",
                "pdf_position",
              )
            }}
          >
            <SelectTrigger id="brand_block_position_pdf" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Quote and invoice PDFs.</p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="brand_block_position_email">Email position</Label>
          <Select
            value={values.brand_block_position_email ?? "bottom"}
            disabled={!canEdit || savingKey === "brand_block_position_email"}
            onValueChange={(value) => {
              setValues((v) => ({ ...v, brand_block_position_email: value }))
              void patch(
                { brand_block_position_email: value },
                "Email position",
                "brand_block_position_email",
              )
            }}
          >
            <SelectTrigger id="brand_block_position_email" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">All outgoing emails.</p>
        </div>
      </div>
    </div>
  )
}
