import { formatMoney } from "@/lib/money"
import { formatDisplayDate } from "@/lib/date-format"
import type { PricingSnapshot } from "@/lib/types"

interface TrainOverrideNoteProps {
  snapshot: PricingSnapshot | null
  /** The quote's currency, used when the override was typed in it (no sourceCurrency stamped). */
  quoteCurrency: string
}

/**
 * "Manual adult fare — R9 000,00 pp, replacing R12 500,00 · set by Carmen on 29 Sep 2026".
 *
 * INTERNAL ONLY, exactly like TourOverrideNote/TransportOverrideNote. The client sees the suite
 * and its amount; what the rate card said, and who decided otherwise, is ours. Do not add this to
 * lib/quotes/pdf/quote-document.tsx, lib/quotes/quote-summary-block.ts, or any email token.
 *
 * Renders nothing for a line with no train fare override, so it can be dropped into a line-item
 * table unguarded. Only lines whose own passenger kind was typed carry the snapshot fields — a
 * kind left blank prices off the card and shows nothing here.
 */
export function TrainOverrideNote({ snapshot, quoteCurrency }: TrainOverrideNoteProps) {
  // 0 is a real override (a comped fare), so this is a null check, not a truthiness one.
  if (snapshot?.manualTrainFare === null || snapshot?.manualTrainFare === undefined) {
    return null
  }

  const currency = snapshot.sourceCurrency ?? quoteCurrency
  const base = snapshot.manualTrainFareBase
  const setBy = snapshot.manualTrainFareSetByName
  const setAt = snapshot.manualTrainFareSetAt
  const kind =
    snapshot.passengerKind === "child" ? "child" : snapshot.passengerKind === "infant" ? "infant" : "adult"

  const attribution = [
    setBy ? `set by ${setBy}` : null,
    setAt ? `on ${formatDisplayDate(setAt)}` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="text-[11px] text-amber-600 dark:text-amber-500">
      ⚑ Manual {kind} fare — {formatMoney(snapshot.manualTrainFare, currency)} pp
      {base === null || base === undefined
        ? ", no rate card covered this suite"
        : `, replacing ${formatMoney(base, currency)}`}
      {attribution ? ` · ${attribution}` : ""}
    </div>
  )
}
