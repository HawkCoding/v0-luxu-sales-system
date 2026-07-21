"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { MAX_IMAGE_MB } from "@/lib/upload-limits"
import { useEmailSignatureSettings, type EmailSignatureSettings } from "@/lib/use-data"

interface EmailSignatureSettingsEditorProps {
  canEdit: boolean
}

type TextKey = Exclude<keyof EmailSignatureSettings, "signature_enabled" | "signature_banner_url">

const TEXT_FIELDS: { key: TextKey; label: string; rows?: number }[] = [
  { key: "signature_company_line", label: "Company line", rows: 2 },
  { key: "signature_registration_line", label: "Registration line" },
  { key: "signature_trading_hours", label: "Trading hours" },
  { key: "signature_divisions_line", label: "Divisions line" },
  { key: "signature_confidentiality", label: "Confidentiality notice", rows: 3 },
]

/**
 * Company-wide chrome appended under every salesperson's signature (name,
 * title, contact — edited per person on the mailbox rows in Settings ›
 * Communication). Nothing here is per-person; SMTP/IMAP only transport a
 * message, so this text and banner are what actually renders — there is no
 * external service that stamps a signature onto outgoing mail.
 */
export function EmailSignatureSettingsEditor({ canEdit }: EmailSignatureSettingsEditorProps) {
  const { data, isLoading, error, mutate } = useEmailSignatureSettings()
  const [values, setValues] = useState<Partial<EmailSignatureSettings>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (data) setValues(data)
  }, [data])

  const patch = async (payload: Partial<EmailSignatureSettings>, label: string, key: string) => {
    setSavingKey(key)
    try {
      const res = await fetch("/api/settings/email-signature", {
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
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      toast.error("The banner must be a PNG or JPEG image.")
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/settings/email-signature/banner", { method: "POST", body })
      if (!res.ok) throw new Error()
      toast.success("Banner saved")
      mutate()
    } catch {
      toast.error("Failed to upload banner")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load signature settings. Refresh to try again.
      </p>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-secondary rounded" />
        ))}
      </div>
    )
  }

  const enabled = values.signature_enabled !== "false"

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">Append signature to outgoing emails</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            SMTP/IMAP only transport a message — nothing appends a signature automatically.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={!canEdit || savingKey === "signature_enabled"}
          onCheckedChange={(next) => {
            const value = next ? "true" : "false"
            setValues((v) => ({ ...v, signature_enabled: value }))
            void patch({ signature_enabled: value }, "Signature toggle", "signature_enabled")
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Banner image</Label>
        <div className="flex items-center gap-3">
          {values.signature_banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={values.signature_banner_url}
              alt="Signature banner preview"
              className="h-14 max-w-[220px] rounded border object-contain bg-muted/30"
            />
          ) : (
            <div className="h-14 w-[220px] rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
              No banner uploaded
            </div>
          )}
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleUpload(file)
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG or JPEG, up to {MAX_IMAGE_MB} MB.</p>
      </div>

      {TEXT_FIELDS.map(({ key, label, rows }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          <Textarea
            id={key}
            rows={rows ?? 1}
            value={values[key] ?? ""}
            disabled={!canEdit}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            onBlur={() => {
              if (values[key] !== data[key]) void patch({ [key]: values[key] ?? "" }, label, key)
            }}
          />
        </div>
      ))}
    </div>
  )
}
