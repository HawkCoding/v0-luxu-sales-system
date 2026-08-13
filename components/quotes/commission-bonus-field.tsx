"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { currencySymbol, formatMoney } from "@/lib/money"
import { Loader2 } from "lucide-react"
import type { Quote } from "@/lib/types"

interface CommissionBonusFieldProps {
  quote: Quote
  /** False on a sent/accepted quote, or without the edit:quotes permission — renders read-only. */
  editable: boolean
  onSaved: () => void
}

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return 0
  const parsed = Number(trimmed.replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

/**
 * A flat amount (positive or negative), in the quote's own currency, that the salesperson
 * adjusts on top of the calculated commission. It is folded into the quote's existing Commission
 * line rather than added as a new one, so the client never sees the split.
 */
export function CommissionBonusField({ quote, editable, onSaved }: CommissionBonusFieldProps) {
  const saved = quote.commissionBonus ?? 0
  const [value, setValue] = useState(saved !== 0 ? String(saved) : "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(saved !== 0 ? String(saved) : "")
  }, [saved])

  if (!editable) {
    if (saved === 0) return null
    return (
      <div className="flex justify-end gap-8 text-xs">
        <span className="text-muted-foreground">Rounding</span>
        <span className="text-foreground font-medium w-28 text-right">
          {formatMoney(saved, quote.currency)}
        </span>
      </div>
    )
  }

  const parsed = parseAmount(value)
  const dirty = parsed !== null && parsed !== saved

  async function save() {
    if (parsed === null) {
      toast.error("Enter a valid amount.")
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/quotes/${quote.id}/commission-bonus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bonus: parsed, expectedUpdatedAt: quote.updatedAt }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to save rounding")
      onSaved()
      toast.success(parsed !== 0 ? "Rounding added to the commission line." : "Rounding removed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rounding")
    } finally {
      setSaving(false)
    }
  }

  const inputId = `commission-bonus-${quote.id}`

  return (
    <div className="flex items-center justify-end gap-3 flex-wrap">
      <Label htmlFor={inputId} className="text-xs text-muted-foreground font-normal">
        Rounding
      </Label>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">{currencySymbol(quote.currency)}</span>
        <Input
          id={inputId}
          inputMode="decimal"
          className="h-8 w-28 text-xs text-right"
          placeholder="0.00"
          value={value}
          disabled={saving}
          aria-invalid={parsed === null}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty && !saving) {
              event.preventDefault()
              void save()
            }
          }}
        />
        <Button size="sm" variant="outline" className="h-8" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>
      <p id={`${inputId}-hint`} className="w-full text-right text-[10px] text-muted-foreground">
        {parsed === null ? "Enter a valid amount." : "Added to the Commission line and the quote total."}
      </p>
    </div>
  )
}
