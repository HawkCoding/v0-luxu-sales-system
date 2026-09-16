"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Info, Loader2, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { currencySymbol, formatMoney } from "@/lib/money"
import { findCommissionLineIndex, getCommissionBonus } from "@/lib/quotes/apply-commission-bonus"
import { computeQuoteAdjustments } from "@/lib/quotes/quote-adjustments"
import type { CommissionKind, Quote } from "@/lib/types"

interface QuoteAdjustmentsLedgerProps {
  quote: Quote
  /** False on a sent/accepted quote, or without the edit:quotes permission — renders read-only. */
  editable: boolean
  onSaved: () => void
}

interface Draft {
  commissionType: CommissionKind | null
  commissionValue: number | null
  roundingShown: boolean
  roundingValue: number
  agentShown: boolean
  agentValue: number
  discountShown: boolean
  discountType: CommissionKind | null
  discountValue: number
  discountVisible: boolean
}

function buildSavedDraft(quote: Quote): Draft {
  const commissionBreakdown = quote.lineItems.find((li) => li.pricingSnapshot?.commission != null)
    ?.pricingSnapshot?.commission
  const roundingValue = quote.commissionBonus ?? 0
  const agentValue = quote.agentCommission ?? 0
  return {
    commissionType: commissionBreakdown?.type ?? null,
    commissionValue: commissionBreakdown?.value ?? null,
    roundingShown: roundingValue !== 0,
    roundingValue,
    agentShown: agentValue > 0,
    agentValue,
    discountShown: quote.discountType != null,
    discountType: quote.discountType ?? null,
    discountValue: quote.discountValue ?? 0,
    discountVisible: quote.discountVisible ?? true,
  }
}

const KIND_OPTIONS: { key: CommissionKind; label: string }[] = [
  { key: "percent", label: "%" },
  { key: "per_person", label: "pp" },
  { key: "fixed", label: "R" },
]

function KindToggle({
  id,
  value,
  onChange,
}: {
  id: string
  value: CommissionKind
  onChange: (kind: CommissionKind) => void
}) {
  return (
    <div id={id} role="radiogroup" className="inline-flex rounded-md border bg-muted p-0.5">
      {KIND_OPTIONS.map((option) => {
        const selected = value === option.key
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.key)}
            className={`px-2 py-1 text-[11px] rounded-sm transition-colors ${
              selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ValueInput({
  id,
  type,
  value,
  currency,
  onChange,
}: {
  id: string
  type: CommissionKind
  value: number | null
  currency: string
  onChange: (value: number | null) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {type !== "percent" && <span className="text-xs text-muted-foreground">{currencySymbol(currency)}</span>}
      <NumericInput
        id={id}
        min="0"
        step={type === "per_person" ? "1" : "0.01"}
        nullable
        value={value}
        placeholder="0"
        className="h-8 w-20 text-xs text-right"
        onValueChange={onChange}
      />
      {type !== "fixed" && (
        <span className="text-xs text-muted-foreground">{type === "percent" ? "%" : "/ pax"}</span>
      )}
    </div>
  )
}

function LedgerRow({
  label,
  tooltip,
  control,
  onRemove,
  removeLabel,
  amount,
  amountClassName,
}: {
  label: string
  tooltip?: string
  control?: React.ReactNode
  onRemove?: () => void
  removeLabel?: string
  amount: string
  amountClassName?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`${label} info`} className="text-muted-foreground/60 hover:text-foreground">
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
      {control}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <span className={cn("w-28 text-right text-xs font-medium tabular-nums text-foreground", amountClassName)}>
        {amount}
      </span>
    </div>
  )
}

export function QuoteAdjustmentsLedger({ quote, editable, onSaved }: QuoteAdjustmentsLedgerProps) {
  const saved = useMemo(() => buildSavedDraft(quote), [quote])
  const [draft, setDraft] = useState<Draft>(saved)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.updatedAt])

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // Client-side preview only — it doesn't know the real booking headcount, so a brand-new
  // per_person Commission/Discount (no existing breakdown to read one off) previews against a
  // fallback of 1 pax until Save reloads the server-computed figure. Reuses the exact function the
  // API route calls, so once a breakdown exists the preview matches the save precisely.
  const preview = useMemo(() => {
    const commission =
      draft.commissionType !== null && draft.commissionValue !== null
        ? { type: draft.commissionType, value: draft.commissionValue }
        : null
    const discount =
      draft.discountShown && draft.discountType !== null
        ? { type: draft.discountType, value: draft.discountValue, visible: draft.discountVisible }
        : null
    return computeQuoteAdjustments(quote.lineItems, {
      commission,
      commissionBonus: draft.roundingShown ? draft.roundingValue : 0,
      agentCommission: draft.agentShown ? draft.agentValue : 0,
      discount,
      bookingHeadcount: 1,
    })
  }, [quote.lineItems, draft])

  const idPrefix = `quote-adjustments-${quote.id}`

  if (!editable) {
    const commissionIndex = findCommissionLineIndex(quote.lineItems)
    const commissionLine = commissionIndex >= 0 ? quote.lineItems[commissionIndex] : null
    const commissionBreakdown = commissionLine?.pricingSnapshot?.commission ?? null
    const commissionAmount = commissionBreakdown?.amount ?? 0
    const bonus = commissionLine ? getCommissionBonus(commissionLine) : 0
    const servicesSubtotal = quote.lineItems.reduce(
      (sum, li, idx) => (idx === commissionIndex ? sum : sum + li.total),
      0,
    )
    const agentCommission = quote.agentCommission ?? 0
    const discountAmount = quote.discountAmount ?? 0

    return (
      <div className="space-y-1">
        {commissionBreakdown && (
          <>
            <LedgerRow label="Services" amount={formatMoney(servicesSubtotal, quote.currency)} />
            <LedgerRow label="Commission" amount={`+ ${formatMoney(commissionAmount, quote.currency)}`} />
            {bonus !== 0 && <LedgerRow label="Rounding" amount={`+ ${formatMoney(bonus, quote.currency)}`} />}
          </>
        )}
        {agentCommission > 0 && (
          <LedgerRow
            label="Agent Commission"
            amount={`− ${formatMoney(agentCommission, quote.currency)}`}
            amountClassName="text-destructive/80"
          />
        )}
        {discountAmount > 0 && (
          <LedgerRow
            label={`Discount${quote.discountVisible ? "" : " (hidden)"}`}
            amount={`− ${formatMoney(discountAmount, quote.currency)}`}
            amountClassName="text-destructive/80"
          />
        )}
      </div>
    )
  }

  function toggleRounding(shown: boolean) {
    setDraft((d) => ({ ...d, roundingShown: shown, roundingValue: shown ? d.roundingValue : 0 }))
  }
  function toggleAgent(shown: boolean) {
    setDraft((d) => ({ ...d, agentShown: shown, agentValue: shown ? d.agentValue : 0 }))
  }
  function toggleDiscount(shown: boolean) {
    setDraft((d) => ({
      ...d,
      discountShown: shown,
      discountType: shown ? (d.discountType ?? "percent") : null,
      discountValue: shown ? d.discountValue : 0,
      discountVisible: shown ? d.discountVisible : true,
    }))
  }

  async function save() {
    if (draft.commissionType !== null && draft.commissionValue === null) {
      toast.error("Choose a commission value, or clear the commission type.")
      return
    }
    if (draft.discountShown && draft.discountType === null) {
      toast.error("Choose a discount type.")
      return
    }
    if (preview.errors.length > 0) {
      toast.error(preview.errors[0])
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/quotes/${quote.id}/adjustments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commission:
            draft.commissionType !== null && draft.commissionValue !== null
              ? { type: draft.commissionType, value: draft.commissionValue }
              : null,
          commissionBonus: draft.roundingShown ? draft.roundingValue : 0,
          agentCommission: draft.agentShown ? draft.agentValue : 0,
          discount:
            draft.discountShown && draft.discountType !== null
              ? { type: draft.discountType, value: draft.discountValue, visible: draft.discountVisible }
              : null,
          expectedUpdatedAt: quote.updatedAt,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Failed to save pricing adjustments")
      onSaved()
      toast.success("Pricing adjustments saved.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save pricing adjustments")
    } finally {
      setSaving(false)
    }
  }

  const commissionActiveType = draft.commissionType ?? "percent"
  const discountActiveType = draft.discountType ?? "percent"

  return (
    <div className="space-y-2">
      <LedgerRow label="Services" amount={formatMoney(preview.servicesSubtotal, quote.currency)} />

      <LedgerRow
        label="Commission"
        tooltip="Applied once to the booking's total. Editable any time before the quote is sent."
        control={
          <>
            <KindToggle
              id={`${idPrefix}-commission-kind`}
              value={commissionActiveType}
              onChange={(kind) =>
                setDraft((d) => ({ ...d, commissionType: kind, commissionValue: d.commissionValue ?? 0 }))
              }
            />
            <ValueInput
              id={`${idPrefix}-commission-value`}
              type={commissionActiveType}
              value={draft.commissionValue}
              currency={quote.currency}
              onChange={(value) => setDraft((d) => ({ ...d, commissionValue: value }))}
            />
          </>
        }
        amount={`+ ${formatMoney(preview.commissionAmount, quote.currency)}`}
      />

      {draft.roundingShown ? (
        <LedgerRow
          label="Rounding"
          tooltip="A flat manual top-up folded into the Commission line. The client never sees the split."
          control={
            <ValueInput
              id={`${idPrefix}-rounding-value`}
              type="fixed"
              value={draft.roundingValue}
              currency={quote.currency}
              onChange={(value) => setDraft((d) => ({ ...d, roundingValue: value ?? 0 }))}
            />
          }
          onRemove={() => toggleRounding(false)}
          removeLabel="Remove rounding"
          amount={`+ ${formatMoney(draft.roundingValue, quote.currency)}`}
        />
      ) : null}

      <LedgerRow label="Subtotal" amount={formatMoney(preview.subtotal, quote.currency)} />

      {draft.agentShown ? (
        <LedgerRow
          label="Agent Commission"
          tooltip="Deducted from the quote total. Shown to the client on the quote and invoice."
          control={
            <ValueInput
              id={`${idPrefix}-agent-value`}
              type="fixed"
              value={draft.agentValue}
              currency={quote.currency}
              onChange={(value) => setDraft((d) => ({ ...d, agentValue: value ?? 0 }))}
            />
          }
          onRemove={() => toggleAgent(false)}
          removeLabel="Remove agent commission"
          amount={`− ${formatMoney(draft.agentValue, quote.currency)}`}
          amountClassName="text-destructive/80"
        />
      ) : null}

      {draft.discountShown ? (
        <LedgerRow
          label="Discount"
          tooltip="Deducted from the total, same step as Agent Commission."
          control={
            <>
              <KindToggle
                id={`${idPrefix}-discount-kind`}
                value={discountActiveType}
                onChange={(kind) => setDraft((d) => ({ ...d, discountType: kind }))}
              />
              <ValueInput
                id={`${idPrefix}-discount-value`}
                type={discountActiveType}
                value={draft.discountValue}
                currency={quote.currency}
                onChange={(value) => setDraft((d) => ({ ...d, discountValue: value ?? 0 }))}
              />
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`${idPrefix}-discount-visible`}
                  checked={draft.discountVisible}
                  onCheckedChange={(checked) => setDraft((d) => ({ ...d, discountVisible: checked === true }))}
                />
                <Label htmlFor={`${idPrefix}-discount-visible`} className="text-[11px] font-normal text-muted-foreground">
                  Show
                </Label>
              </div>
            </>
          }
          onRemove={() => toggleDiscount(false)}
          removeLabel="Remove discount"
          amount={`− ${formatMoney(preview.discountAmount, quote.currency)}`}
          amountClassName="text-destructive/80"
        />
      ) : null}

      {(!draft.roundingShown || !draft.agentShown || !draft.discountShown) && (
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {!draft.roundingShown && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleRounding(true)}>
              <Plus className="h-3 w-3" /> Rounding
            </Button>
          )}
          {!draft.agentShown && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleAgent(true)}>
              <Plus className="h-3 w-3" /> Agent commission
            </Button>
          )}
          {!draft.discountShown && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleDiscount(true)}>
              <Plus className="h-3 w-3" /> Discount
            </Button>
          )}
        </div>
      )}

      <Separator className="my-2" />
      <LedgerRow
        label="Total"
        amount={formatMoney(preview.total, quote.currency)}
        amountClassName="text-sm font-semibold"
      />

      {dirty && (
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" size="sm" variant="outline" className="h-8" disabled={saving} onClick={() => setDraft(saved)}>
            Discard
          </Button>
          <Button type="button" size="sm" className="h-8" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  )
}
