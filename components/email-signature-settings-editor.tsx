"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { HtmlBodyEditor } from "@/components/ui/html-body-editor"
import { useEmailSignatureSettings, type EmailSignatureSettings } from "@/lib/use-data"
import { SENDER_LAYOUT_TOKENS } from "@/lib/email/sender-layout"
import { isEquivalentEditorHtml } from "@/lib/templates/rich-text/equivalent-html"
import { cn } from "@/lib/utils"

interface EmailSignatureSettingsEditorProps {
  canEdit: boolean
  /** Reports whether the rich-text fields hold unsaved changes, so the page can guard navigation. */
  onDirtyChange?: (dirty: boolean) => void
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

const TEXT_KEYS: TextKey[] = TEXT_FIELDS.map((field) => field.key)

interface SettingsForm {
  values: Partial<EmailSignatureSettings>
  synced: Partial<EmailSignatureSettings> | null
}

/**
 * Compared as the editor would render them: every blank form is equal, and the editor's own
 * normalisation of a stored value (a <p> wrapper, re-serialised inline styles) is not a change.
 */
function sameValue(a: string | undefined, b: string | undefined): boolean {
  return isEquivalentEditorHtml(a ?? "", b ?? "")
}

/**
 * Shared chrome every brand's signature inherits unless it sets its own
 * override (edited per brand in Settings › Email Signatures). Nothing here
 * is per-person or per-brand; SMTP/IMAP only transport a message, so this
 * text is what actually renders — there is no external service that stamps
 * a signature onto outgoing mail.
 *
 * Text fields are a local draft saved with "Save changes"; the on/off switch
 * saves immediately.
 */
export function EmailSignatureSettingsEditor({ canEdit, onDirtyChange }: EmailSignatureSettingsEditorProps) {
  const { data, isLoading, error, mutate } = useEmailSignatureSettings()
  // `values` is the draft; `synced` is the last server state it was reconciled
  // against — the baseline for "dirty". Kept in one state so they update atomically.
  const [form, setForm] = useState<SettingsForm>({ values: {}, synced: null })
  const { values, synced } = form
  const [saving, setSaving] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)

  // Re-sync from the server only for fields the user hasn't edited: a
  // refetch (focus revalidation, the mutate() after a save) must never snap
  // a half-typed field back to its stored value.
  useEffect(() => {
    if (!data) return
    setForm((current) => {
      if (!current.synced) return { values: { ...data }, synced: { ...data } }
      const nextValues = { ...current.values }
      for (const key of Object.keys(data) as (keyof EmailSignatureSettings)[]) {
        if (sameValue(current.values[key], current.synced[key])) nextValues[key] = data[key]
      }
      return { values: nextValues, synced: { ...data } }
    })
  }, [data])

  const dirtyKeys = synced ? TEXT_KEYS.filter((key) => !sameValue(values[key], synced[key])) : []
  const isDirty = dirtyKeys.length > 0

  const onDirtyChangeRef = useRef(onDirtyChange)
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange
  }, [onDirtyChange])
  useEffect(() => {
    onDirtyChangeRef.current?.(isDirty)
  }, [isDirty])
  useEffect(() => () => onDirtyChangeRef.current?.(false), [])

  async function send(payload: Partial<EmailSignatureSettings>): Promise<Partial<EmailSignatureSettings> | null> {
    const res = await fetch("/api/settings/email-signature", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(detail?.error ?? "Failed to save")
    }
    return (await res.json().catch(() => null)) as Partial<EmailSignatureSettings> | null
  }

  /** Adopt the stored (sanitized) values for the fields that were sent — unless the user has edited them since. */
  function adopt(sent: Partial<EmailSignatureSettings>, stored: Partial<EmailSignatureSettings>) {
    const keys = Object.keys(sent) as (keyof EmailSignatureSettings)[]
    setForm((current) => {
      const nextValues = { ...current.values }
      const nextSynced = { ...(current.synced ?? {}) }
      for (const key of keys) {
        const storedValue = stored[key] ?? sent[key]
        if (current.values[key] === sent[key]) nextValues[key] = storedValue
        nextSynced[key] = storedValue
      }
      return { values: nextValues, synced: nextSynced }
    })
  }

  async function handleSave() {
    if (!isDirty || saving) return
    const payload: Partial<EmailSignatureSettings> = {}
    for (const key of dirtyKeys) payload[key] = values[key] ?? ""
    setSaving(true)
    try {
      const stored = await send(payload)
      adopt(payload, stored ?? payload)
      toast.success("Shared defaults saved")
      void mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    setForm((current) => {
      if (!current.synced) return current
      const nextValues = { ...current.values }
      for (const key of TEXT_KEYS) nextValues[key] = current.synced[key]
      return { ...current, values: nextValues }
    })
  }

  function setValue(key: keyof EmailSignatureSettings, value: string) {
    setForm((current) =>
      current.values[key] === value ? current : { ...current, values: { ...current.values, [key]: value } },
    )
  }

  async function handleToggle(next: boolean) {
    const value = next ? "true" : "false"
    const previous = values.signature_enabled
    setValue("signature_enabled", value)
    setSavingToggle(true)
    try {
      const stored = await send({ signature_enabled: value })
      adopt({ signature_enabled: value }, stored ?? { signature_enabled: value })
      toast.success("Signature toggle saved")
      void mutate()
    } catch {
      if (previous !== undefined) setValue("signature_enabled", previous)
      toast.error("Failed to save signature toggle")
    } finally {
      setSavingToggle(false)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Couldn’t load signature settings. Refresh to try again.
      </p>
    )
  }

  // Wait for the draft to be seeded too, not just the fetch: the editors used to mount on the
  // render before the seeding effect ran, holding "" — and anything they emitted then was a blank
  // written into the draft over the stored value.
  if (isLoading || !data || !synced) {
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
          disabled={!canEdit || savingToggle}
          aria-label="Append signature to outgoing emails"
          onCheckedChange={(next) => void handleToggle(next)}
        />
      </div>

      {canEdit && (
        <div
          className={cn(
            "sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2",
            isDirty ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950" : "bg-card",
          )}
        >
          <p className="text-sm" role="status" aria-live="polite">
            {saving ? "Saving changes…" : isDirty ? "Unsaved changes" : "All changes saved"}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDiscard} disabled={!isDirty || saving}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden />
              Discard
            </Button>
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!isDirty || saving}>
              {saving ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Save className="mr-1 h-3.5 w-3.5" aria-hidden />
              )}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {TEXT_FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          <HtmlBodyEditor
            id={key}
            variant="compact"
            value={values[key] ?? ""}
            disabled={!canEdit}
            insertTokens={key === "signature_sender_layout" ? SENDER_LAYOUT_TOKENS : undefined}
            onChange={(html) => setValue(key, html)}
          />
        </div>
      ))}
    </div>
  )
}
