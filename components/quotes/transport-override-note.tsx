import { formatMoney } from "@/lib/money"
import { formatDisplayDate } from "@/lib/date-format"
import type { PricingSnapshot } from "@/lib/types"

interface TransportOverrideNoteProps {
  snapshot: PricingSnapshot | null
  /** The quote's currency, used when the override was typed in it (no sourceCurrency stamped). */
  quoteCurrency: string
}

/**
 * "Manual transfer price — R850,00, replacing R950,00 · set by Carmen on 14 Aug 2026".
 *
 * INTERNAL ONLY, exactly like RoomOverrideNote. The client sees the trip and its amount; what the
 * rate card said, and who decided otherwise, is ours. Do not add this to
 * lib/quotes/pdf/quote-document.tsx, lib/quotes/quote-summary-block.ts, or any email token.
 *
 * Also states a complimentary trip ("Complimentary transfer"), since isComplimentaryTransport is
 * independent of manualTransportPrice — see isComplimentaryTransport in lib/quotes/pricing-engine.ts.
 *
 * Renders nothing for a line with none of the above, so it can be dropped into a line-item table
 * unguarded.
 */
export function TransportOverrideNote({ snapshot, quoteCurrency }: TransportOverrideNoteProps) {
  if (snapshot?.isComplimentaryTransport === true) {
    return (
      <div className="text-[11px] text-emerald-600 dark:text-emerald-500">
        Complimentary {snapshot.serviceType === "rental" ? "rental" : "transfer"}
      </div>
    )
  }

  // 0 is a real override (a comped trip), so this is a null check, not a truthiness one.
  if (snapshot?.manualTransportPrice === null || snapshot?.manualTransportPrice === undefined) return null

  const currency = snapshot.sourceCurrency ?? quoteCurrency
  const base = snapshot.manualTransportPriceBase
  const setBy = snapshot.manualTransportPriceSetByName
  const setAt = snapshot.manualTransportPriceSetAt
  const perDay = snapshot.serviceType === "rental" ? "/day" : ""

  const attribution = [
    setBy ? `set by ${setBy}` : null,
    setAt ? `on ${formatDisplayDate(setAt)}` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="text-[11px] text-amber-600 dark:text-amber-500">
      ⚑ Manual {snapshot.serviceType === "rental" ? "rental" : "transfer"} price —{" "}
      {formatMoney(snapshot.manualTransportPrice, currency)}
      {perDay}
      {base === null || base === undefined
        ? ", no rate card covered this trip"
        : `, replacing ${formatMoney(base, currency)}${perDay}`}
      {attribution ? ` · ${attribution}` : ""}
    </div>
  )
}
