import { formatMoney, formatFxRate } from "@/lib/money"
import { formatDisplayDate } from "@/lib/date-format"
import type { PricingSnapshot } from "@/lib/types"

interface FxProvenanceNoteProps {
  snapshot: PricingSnapshot | null
}

/**
 * "↳ USD 6 400,00 @ 17,2500 · 13 Aug 2026" — what a converted line cost before conversion.
 *
 * INTERNAL ONLY. This must never appear on a client-facing document: the whole point of the
 * single-quote-currency rule is that the client sees one number in one currency. Do not add this
 * to lib/quotes/pdf/quote-document.tsx, lib/quotes/quote-summary-block.ts, or any email token.
 *
 * Renders nothing for a native line, so it can be dropped into any line-item table unguarded.
 */
export function FxProvenanceNote({ snapshot }: FxProvenanceNoteProps) {
  if (!snapshot?.sourceCurrency || snapshot.sourceUnitPrice == null || !snapshot.fxRate) {
    return null
  }

  return (
    <div className="text-[11px] text-muted-foreground">
      ↳ {formatMoney(snapshot.sourceUnitPrice, snapshot.sourceCurrency)} @{" "}
      {formatFxRate(snapshot.fxRate)}
      {snapshot.fxRateAsOf ? ` · ${formatDisplayDate(snapshot.fxRateAsOf)}` : ""}
    </div>
  )
}
