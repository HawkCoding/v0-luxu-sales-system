"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface InvoiceStatusOption {
  /** System roles are auto-applied from the booking's payment state. */
  role: "provisional" | "confirmed" | "paid" | "cancelled"
  label: string
}

const ROLE_HINTS: Record<InvoiceStatusOption["role"], string> = {
  provisional: "Before the deposit is paid",
  confirmed: "Deposit received",
  paid: "Paid in full",
  cancelled: "Booking cancelled",
}

interface InvoiceStatusSettingsEditorProps {
  canEdit: boolean
}

/**
 * Renames the four system statuses. Statuses cannot be added or removed: every label is applied
 * automatically from the booking's payment state, and there is no per-invoice picker to apply an
 * extra one with.
 */
export function InvoiceStatusSettingsEditor({ canEdit }: InvoiceStatusSettingsEditorProps) {
  const [options, setOptions] = useState<InvoiceStatusOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/settings/invoice-statuses")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { options: InvoiceStatusOption[] }) => {
        if (!cancelled) setOptions(d.options)
      })
      .catch(() => toast.error("Failed to load invoice statuses"))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateLabel = (index: number, label: string) => {
    setOptions((current) =>
      current.map((option, i) => (i === index ? { ...option, label } : option)),
    )
  }

  const handleSave = async () => {
    const cleaned = options.map((option) => ({ ...option, label: option.label.trim() }))
    if (cleaned.some((option) => option.label.length === 0)) {
      toast.error("Every status needs a label")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/settings/invoice-statuses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options: cleaned }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error)
      }
      setOptions(cleaned)
      toast.success("Invoice statuses saved")
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Failed to save invoice statuses")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={option.role} className="flex items-center gap-2">
            <Input
              value={option.label}
              onChange={(e) => updateLabel(index, e.target.value)}
              disabled={!canEdit}
              maxLength={40}
              aria-label={`Status label ${index + 1}`}
              className="h-8 max-w-xs text-sm"
            />
            <span className="text-xs text-muted-foreground">{ROLE_HINTS[option.role]}</span>
          </div>
        ))}
      </div>
      {canEdit ? (
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save statuses"}
        </Button>
      ) : null}
    </div>
  )
}
