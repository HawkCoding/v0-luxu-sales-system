import type { PassengerTotals } from "@/lib/packages/passenger-totals"

/** Buckets in the order a supplier reads them, with their singular/plural forms. */
const BUCKETS: Array<{ key: keyof PassengerTotals; one: string; many: string }> = [
  { key: "adultCount", one: "adult", many: "adults" },
  { key: "childCount", one: "child", many: "children" },
  { key: "infantCount", one: "infant", many: "infants" },
]

/**
 * The voucher's "Number of Guests" value: a breakdown with no leading total, because the parts
 * already sum to it — "2 adults, 1 child & 2 infants". Empty buckets are dropped entirely, so a
 * couple travelling alone reads "2 adults" rather than trailing a run of zeroes.
 *
 * The single source of truth for this string — both the HTML and the PDF voucher call it, and the
 * two used to build near-identical copies inline.
 */
export function formatGuestCountText(totals: PassengerTotals): string {
  const parts = BUCKETS.filter((bucket) => totals[bucket.key] > 0).map((bucket) => {
    const count = totals[bucket.key]
    return `${count} ${count === 1 ? bucket.one : bucket.many}`
  })

  // Defensive: the readiness gates should never let a passenger-less booking reach a voucher.
  if (parts.length === 0) return "No guests"
  if (parts.length === 1) return parts[0]

  // "&" joins the last pair, commas everything before it.
  const last = parts[parts.length - 1]
  return `${parts.slice(0, -1).join(", ")} & ${last}`
}
