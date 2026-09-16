"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { HtmlBodyEditor } from "@/components/ui/html-body-editor"
import { useEmailSignatureSettings, type EmailSignatureSettings } from "@/lib/use-data"
import { SENDER_LAYOUT_TOKENS } from "@/lib/email/sender-layout"

interface EmailSignatureSettingsEditorProps {
  canEdit: boolean
}

type TextKey = Exclude<keyof EmailSignatureSettings, "signature_enabled">

const TEXT_FIELDS: { key: TextKey; label: string }[] = [
  { key: "signature_sender_layout", label: "Name & contact layout" },
  { key: "signature_company_line", label: "Company line" },
  { key: "signature_registration_line", label: "Registration line" },
  { key: "signature_trading_hours", label: "Trading hours" },
  { key: "signature_divisions_line", label: "Divisions line" },
  { key: "signature_confidentiality", label: "Confidentiality notice" },
  { key: "signature_office_address", label: "Office address" },
]

/**
 * Shared chrome every brand's signature inherits unless it sets its own
 * override (edited per brand in Settings › Email Signatures). Nothing here
 * is per-person or per-brand; SMTP/IMAP only transport a message, so this
 * text is what actually renders — there is no external service that stamps
 * a signature onto outgoing mail.
 */
export function EmailSignatureSettingsEditor({ canEdit }: EmailSignatureSettingsEditorProps) {
  const { data, isLoading, error, mutate } = useEmailSignatureSettings()
  const [values, setValues] = useState<Partial<EmailSignatureSettings>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)

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

      {TEXT_FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          <HtmlBodyEditor
            id={key}
            variant="compact"
            value={values[key] ?? ""}
            disabled={!canEdit}
            insertTokens={key === "signature_sender_layout" ? SENDER_LAYOUT_TOKENS : undefined}
            onChange={(html) => setValues((v) => ({ ...v, [key]: html }))}
            onBlur={() => {
              if (values[key] !== data[key]) void patch({ [key]: values[key] ?? "" }, label, key)
            }}
          />
        </div>
      ))}
    </div>
  )
}
