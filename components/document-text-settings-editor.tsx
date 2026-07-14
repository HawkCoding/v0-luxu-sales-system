"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTextSettings, type DocumentTextSettings } from "@/lib/use-data"

interface DocumentTextSettingsEditorProps {
  canEdit: boolean
}

interface FieldConfig {
  key: keyof DocumentTextSettings
  label: string
  group: string
  multiline: boolean
  /** Saving an empty value is allowed (clears the text). */
  allowEmpty?: boolean
}

const FIELDS: FieldConfig[] = [
  { key: "quote_doc_title", label: "Quote PDF title", group: "Quote document", multiline: false },
  { key: "quote_doc_footer_text", label: "Quote PDF footer (supports {{validUntil}}, {{currency}})", group: "Quote document", multiline: true },
  { key: "quote_doc_includes_heading", label: "Quote itinerary heading", group: "Quote document", multiline: false },
  { key: "voucher_doc_title", label: "Voucher PDF title", group: "Voucher document", multiline: false },
  { key: "invoice_doc_deposit_title", label: "Deposit invoice title", group: "Invoice document", multiline: false },
  { key: "invoice_doc_final_title", label: "Final invoice title", group: "Invoice document", multiline: false },
  { key: "invoice_doc_footer_text", label: "Invoice PDF footer", group: "Invoice document", multiline: true },
  { key: "itinerary_doc_journey_heading", label: "Itinerary journey heading", group: "Itinerary document", multiline: false },
  { key: "itinerary_doc_intro_text", label: "Itinerary intro paragraph (leave empty to omit)", group: "Itinerary document", multiline: true, allowEmpty: true },
]

export function DocumentTextSettingsEditor({ canEdit }: DocumentTextSettingsEditorProps) {
  const { data, isLoading, error, mutate } = useDocumentTextSettings()
  const [values, setValues] = useState<Partial<DocumentTextSettings>>({})
  const [savingField, setSavingField] = useState<string | null>(null)

  useEffect(() => {
    if (data) setValues(data)
  }, [data])

  const handleSave = async (field: FieldConfig) => {
    const { key, label } = field
    const value = values[key]?.trim() ?? ""
    if (!value && !field.allowEmpty) return
    setSavingField(key)
    try {
      const res = await fetch("/api/settings/document-text", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${label} saved`)
      mutate()
    } catch {
      toast.error(`Failed to save ${label.toLowerCase()}`)
    } finally {
      setSavingField(null)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load document text settings. Refresh to try again.
      </p>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-pulse space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 bg-secondary rounded" />
        ))}
      </div>
    )
  }

  const groups = Array.from(new Set(FIELDS.map((f) => f.group)))

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group} className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
          {FIELDS.filter((f) => f.group === group).map((field) => (
            <div key={field.key}>
              <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
              <div className="flex gap-2 mt-1 items-start">
                {field.multiline ? (
                  <Textarea
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    readOnly={!canEdit}
                    rows={2}
                    className="text-sm"
                  />
                ) : (
                  <Input
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    readOnly={!canEdit}
                    className="text-sm"
                  />
                )}
                {canEdit && (
                  <Button
                    size="sm"
                    onClick={() => handleSave(field)}
                    disabled={savingField === field.key || (!field.allowEmpty && !values[field.key]?.trim())}
                  >
                    {savingField === field.key ? "Saving…" : "Save"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
