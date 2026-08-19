import { formatMoney } from "@/lib/money"
import { formatDisplayDate } from "@/lib/date-format"
import type { PricingSnapshot } from "@/lib/types"

interface TourOverrideNoteProps {
  snapshot: PricingSnapshot | null
  /** The quote's currency, used when the override was typed in it (no sourceCurrency stamped). */
  quoteCurrency: string
}

/**
 * "Manual tour price — R3 600,00, replacing R4 000,00 · set by Carmen on 14 Aug 2026".
 *
 * INTERNAL ONLY, exactly like RoomOverrideNote/FxProvenanceNote. The client sees the tour and its
 * amount; what the rate card said, and who decided otherwise, is ours. Do not add this to
 * lib/quotes/pdf/quote-document.tsx, lib/quotes/quote-summary-block.ts, or any email token.
 *
 * Renders nothing for a line with no override, so it can be dropped into a line-item table
 * unguarded.
 */
export function TourOverrideNote({ snapshot, quoteCurrency }: TourOverrideNoteProps) {
  // 0 is a real override (a comped tour), so this is a null check, not a truthiness one.
  if (snapshot?.manualTourPrice === null || snapshot?.manualTourPrice === undefined) {
    return null
  }

  const currency = snapshot.sourceCurrency ?? quoteCurrency
  const base = snapshot.manualTourPriceBase
  const setBy = snapshot.manualTourPriceSetByName
  const setAt = snapshot.manualTourPriceSetAt

  const attribution = [
    setBy ? `set by ${setBy}` : null,
    setAt ? `on ${formatDisplayDate(setAt)}` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="text-[11px] text-amber-600 dark:text-amber-500">
      ⚑ Manual tour price — {formatMoney(snapshot.manualTourPrice, currency)}
      {base === null || base === undefined
        ? ", no rate card covered this tour"
        : `, replacing ${formatMoney(base, currency)}`}
      {attribution ? ` · ${attribution}` : ""}
    </div>
  )
}
