"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NumericInput } from "@/components/ui/numeric-input"
import { formatDisplayDate } from "@/lib/date-format"
import type { FxRateMap } from "@/lib/pricing/convert-currency"

interface FxRateBannerProps {
  /** Currencies in play that are not the quote's. Empty renders nothing. */
  foreignCurrencies: string[]
  quoteCurrency: string
  rates: FxRateMap
  asOf: string | null
  stale: boolean
  onRefresh: () => void | Promise<void>
  onRateChange: (currency: string, rate: number) => void
}

/**
 * The mixed-currency notice on Build Booking. Kept to a single line per currency: the dialog is
 * already dense, and this is a confirmation ("we used 17,25") rather than a decision the
 * salesperson has to make. It renders nothing at all when every price is already native.
 *
 * The rate box is editable so a salesperson can nudge it a few cents before applying. Whatever
 * is in it is sent with the apply request, so the preview and the saved lines cannot disagree.
 */
export function FxRateBanner({
  foreignCurrencies,
  quoteCurrency,
  rates,
  asOf,
  stale,
  onRefresh,
  onRateChange,
}: FxRateBannerProps) {
  if (foreignCurrencies.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
      {foreignCurrencies.map((currency) => (
        <span key={currency} className="flex items-center gap-1.5">
          <span className="font-medium">
            {currency} → {quoteCurrency}
          </span>
          <NumericInput
            min="0"
            step="0.01"
            className="h-7 w-24"
            aria-label={`${currency} to ${quoteCurrency} exchange rate`}
            value={rates[currency] ?? null}
            nullable
            onValueChange={(next) => {
              if (next !== null) onRateChange(currency, next)
            }}
          />
        </span>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Refresh exchange rates"
        onClick={() => void onRefresh()}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>

      <span className="text-muted-foreground">
        {asOf ? formatDisplayDate(asOf) : "no rate loaded"}
        {/* Never rely on colour alone: the word "stale" carries the meaning by itself. */}
        {stale ? <span className="ml-1.5 text-amber-600 dark:text-amber-500">· stale</span> : null}
      </span>
    </div>
  )
}
