"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { currencySymbol, formatMoney } from "@/lib/money"
import { Loader2 } from "lucide-react"
import type { Quote } from "@/lib/types"

interface AgentCommissionFieldProps {
  quote: Quote
  /** False on a sent/accepted quote, or without the edit:quotes permission — renders read-only. */
  editable: boolean
  onSaved: () => void
}

/** Always a positive magnitude — the minus sign is a fixed part of the field's own display, not
 *  something the salesperson types. A typed "-" or "+" is stripped rather than rejected. */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return 0
  const parsed = Number(trimmed.replace(/\s/g, "").replace(/^[-+]/, "").replace(",", "."))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

/**
 * A flat discount given to a booking agency that sold this journey through us, in the quote's
 * own currency. Unlike CommissionBonusField (Rounding), which is folded invisibly into the
 * Commission line, this is a total-level adjustment the client sees on both the quote and the
 * invoice — so it renders in red everywhere, including here.
 */
export function AgentCommissionField({ quote, editable, onSaved }: AgentCommissionFieldProps) {
  const saved = quote.agentCommission ?? 0
  const [value, setValue] = useState(saved !== 0 ? String(saved) : "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(saved !== 0 ? String(saved) : "")
  }, [saved])

  if (!editable) {
    if (saved === 0) return null
    return (
      <div className="flex justify-end gap-8 text-xs">
        <span className="text-destructive">Agent Commission</span>
        <span className="text-destructive font-medium w-28 text-right">
          -{formatMoney(saved, quote.currency)}
        </span>
      </div>
    )
  }

  const parsed = parseAmount(value)
  const dirty = parsed !== null && parsed !== saved

  async function save() {
    if (parsed === null) {
      toast.error("Enter a positive amount — it is deducted automatically.")
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`/api/quotes/${quote.id}/agent-commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentCommission: parsed, expectedUpdatedAt: quote.updatedAt }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to save Agent Commission")
      onSaved()
      toast.success(parsed !== 0 ? "Agent Commission deducted from the quote total." : "Agent Commission removed.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Agent Commission")
    } finally {
      setSaving(false)
    }
  }

  const inputId = `agent-commission-${quote.id}`

  return (
    <div className="flex items-center justify-end gap-3 flex-wrap">
      <Label htmlFor={inputId} className="text-xs text-destructive font-normal">
        Agent Commission
      </Label>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-destructive">-{currencySymbol(quote.currency)}</span>
        <Input
          id={inputId}
          inputMode="decimal"
          className="h-8 w-28 text-xs text-right text-destructive border-destructive focus-visible:ring-destructive/40"
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
        {parsed === null
          ? "Enter a positive amount — it is deducted automatically."
          : "Deducted from the quote total. Shown to the client on the quote and invoice."}
      </p>
    </div>
  )
}
