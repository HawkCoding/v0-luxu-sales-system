"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface InvoiceStatusOption {
  /** System roles are auto-applied from the booking's payment state. */
  role: "provisional" | "confirmed" | "paid" | "cancelled" | null
  label: string
}

const ROLE_HINTS: Record<NonNullable<InvoiceStatusOption["role"]>, string> = {
  provisional: "Before the deposit is paid",
  confirmed: "Deposit received",
  paid: "Paid in full",
  cancelled: "Booking cancelled",
}

interface InvoiceStatusSettingsEditorProps {
  canEdit: boolean
}

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

  const removeOption = (index: number) => {
    setOptions((current) => current.filter((_, i) => i !== index))
  }

  const addOption = () => {
    setOptions((current) => [...current, { role: null, label: "" }])
  }

  const handleSave = async () => {
    const cleaned = options
      .map((option) => ({ ...option, label: option.label.trim() }))
      .filter((option) => option.label.length > 0)
    if (cleaned.length === 0) {
      toast.error("At least one status is required")
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
          <div key={index} className="flex items-center gap-2">
            <Input
              value={option.label}
              onChange={(e) => updateLabel(index, e.target.value)}
              disabled={!canEdit}
              maxLength={40}
              aria-label={`Status label ${index + 1}`}
              className="h-8 max-w-xs text-sm"
            />
            <span className="text-xs text-muted-foreground">
              {option.role ? ROLE_HINTS[option.role] : "Manual"}
            </span>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => removeOption(index)}
                aria-label={`Remove status ${option.label || index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add status
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save statuses"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
