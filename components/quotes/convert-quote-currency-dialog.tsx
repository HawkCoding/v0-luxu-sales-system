"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowRight, Coins, Loader2, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { CurrencySelect } from "@/components/currency-select"
import { useFxRates } from "@/lib/fx/use-fx-rates"
import { formatMoney, normaliseCurrency } from "@/lib/money"
import { applyFxRate, convertAmount } from "@/lib/pricing/convert-currency"
import { formatDisplayDate } from "@/lib/date-format"
import { CURRENCIES } from "@/lib/types"
import type { QuoteLineItem } from "@/lib/types"

interface ConvertQuoteCurrencyDialogProps {
  quoteId: string
  /** The currency the quote is in today. */
  currency: string
  lineItems: QuoteLineItem[]
  total: number
  /** Sent/accepted quotes can't be converted in place — the trigger explains why and points at
   *  Revise instead of silently re-pricing a document the client already has. */
  requiresRevision: boolean
  onConverted: () => void
}

/**
 * Re-denominates a quote. Draft quotes convert in place; anything already sent has to go through
 * Revise so the client's copy and any invoice raised off it stay in agreement.
 *
 * The rate is pre-filled from the shared cache and freely editable — a salesperson often has a
 * better number from the bank than yesterday's ECB close, and nudging it a few cents is the
 * whole point of the control.
 */
export function ConvertQuoteCurrencyDialog({
  quoteId,
  currency,
  lineItems,
  total,
  requiresRevision,
  onConverted,
}: ConvertQuoteCurrencyDialogProps) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>("")
  const [rateInput, setRateInput] = useState<number | null>(null)
  const [converting, setConverting] = useState(false)
  const { rates, asOf, stale, loading, refresh } = useFxRates(open)

  const from = normaliseCurrency(currency)
  const options = useMemo(() => CURRENCIES.filter((entry) => entry.value !== from), [from])

  // The market rate for the chosen pair, before any hand edit. Null when the pair has no rate
  // loaded yet — the salesperson can still type one.
  const suggestedRate = useMemo(() => {
    if (!target || target === from) return null
    try {
      return convertAmount(1, from, target, rates).rate
    } catch {
      return null
    }
  }, [from, target, rates])

  const effectiveRate = rateInput ?? suggestedRate

  const preview = useMemo(() => {
    if (!target || !effectiveRate) return null
    return {
      lines: lineItems.slice(0, 6).map((line) => ({
        description: line.description,
        before: formatMoney(line.total, from),
        after: formatMoney(applyFxRate(line.total, effectiveRate), target),
      })),
      hiddenCount: Math.max(0, lineItems.length - 6),
      totalBefore: formatMoney(total, from),
      // Per-line rounding means this is a close approximation of the saved total, not the exact
      // figure — the server recomputes it from the converted lines. Labelled "approx." below.
      totalAfter: formatMoney(applyFxRate(total, effectiveRate), target),
    }
  }, [target, effectiveRate, lineItems, total, from])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setTarget("")
      setRateInput(null)
    }
  }

  async function convert() {
    if (!target || !effectiveRate) return
    setConverting(true)
    try {
      const response = await fetch(`/api/quotes/${quoteId}/currency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: target, rate: effectiveRate, asOf }),
      })
      const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not change the quote's currency")
      }

      toast.success(`Quote re-priced in ${target}`)
      handleOpenChange(false)
      onConverted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the quote's currency")
    } finally {
      setConverting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Coins className="mr-1.5 h-3.5 w-3.5" />
          Currency
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change quote currency</DialogTitle>
          <DialogDescription>
            {requiresRevision
              ? "This quote has already gone out, so its currency is fixed."
              : `Re-prices every line from ${from} into the currency you pick. The client only ever sees the new currency.`}
          </DialogDescription>
        </DialogHeader>

        {requiresRevision ? (
          <p className="text-sm text-muted-foreground">
            The client is holding a {from} quote, and any invoice raised off it agrees with that
            document. Use <span className="font-medium text-foreground">Revise</span> instead — it
            keeps this version on record and starts a new one you can price in another currency.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label>From</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">
                  {from}
                </div>
              </div>
              <ArrowRight className="mb-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CurrencySelect
                label="To"
                value={target}
                onChange={(next) => {
                  setTarget(next)
                  // Drop any hand-typed rate: it belonged to the previous pair.
                  setRateInput(null)
                }}
                className="w-48"
              />
            </div>

            {target ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fx-rate">Rate</Label>
                  <NumericInput
                    id="fx-rate"
                    min="0"
                    // A 1c step: the salesperson nudging a rate works in cents, not
                    // ten-thousandths. Typing more precision by hand still works.
                    step="0.01"
                    className="h-9 w-32"
                    nullable
                    placeholder={suggestedRate ? String(suggestedRate) : "Enter a rate"}
                    value={effectiveRate}
                    onValueChange={setRateInput}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 h-9 w-9"
                  aria-label="Refresh exchange rates"
                  disabled={loading}
                  onClick={() => {
                    setRateInput(null)
                    void refresh()
                  }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <p className="mb-2 text-xs text-muted-foreground">
                  1 {from} = {effectiveRate ?? "—"} {target}
                  {asOf ? ` · ${formatDisplayDate(asOf)}` : ""}
                  {stale ? (
                    <span className="ml-1.5 text-amber-600 dark:text-amber-500">· stale</span>
                  ) : null}
                </p>
              </div>
            ) : null}

            {preview ? (
              <div className="rounded-md border">
                <table className="w-full text-xs">
                  <tbody>
                    {preview.lines.map((line, index) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="px-3 py-1.5 text-muted-foreground">{line.description}</td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-muted-foreground">
                          {line.before}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium">
                          {line.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/40">
                      <td className="px-3 py-2 font-medium">
                        Total
                        {preview.hiddenCount > 0 ? (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            (+{preview.hiddenCount} more {preview.hiddenCount === 1 ? "line" : "lines"})
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
                        {preview.totalBefore}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                        ≈ {preview.totalAfter}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}

            {options.length === 0 ? (
              <p className="text-xs text-muted-foreground">No other currency is configured.</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {requiresRevision ? "Close" : "Cancel"}
          </Button>
          {requiresRevision ? null : (
            <Button type="button" onClick={() => void convert()} disabled={!target || !effectiveRate || converting}>
              {converting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Re-price in {target || "…"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
