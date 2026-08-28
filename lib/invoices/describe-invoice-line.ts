import type { PricingSnapshot } from "@/lib/types"

/**
 * The invoice's "Travel Package Description" column reads better as
 * "Supplier — Route direction" than the verbose line description the pricing
 * engine stores on the quote (which carries suite type, variant vocabulary
 * and "- Adult"/"- Child" suffixes for the quote's own presentation). Derived
 * at render time from the line's pricing snapshot; the stored quote line
 * description is never rewritten.
 */
export function describeInvoiceLine(
  storedDescription: string,
  snapshot: PricingSnapshot | null | undefined,
): string {
  // Transfer/car-rental supplier identity is never shown to the client — always generic.
  const isGenericService = snapshot?.serviceType === "transfer" || snapshot?.serviceType === "rental"
  const supplier = isGenericService ? null : snapshot?.supplierName?.trim() || snapshot?.legLabel?.trim() || null

  // A tour operator sells the tour type, not the itinerary that describes it — routeName on a
  // tour line is descriptive copy shared by every tour on the leg, so two different tours would
  // otherwise render identically. Falls back to routeName only for snapshots stamped before the
  // tour type was captured here.
  const isTour = snapshot?.supplierKind === "tour_operator"
  const detail = (isTour ? snapshot?.suiteTypeName?.trim() : null) || snapshot?.routeName?.trim() || null

  let base: string
  if (supplier) {
    base = detail ? `${supplier} — ${detail}` : supplier
  } else if (isGenericService) {
    // Category word only, never the supplier — "Transfer <route>" / "Rental <route>".
    const categoryLabel = snapshot?.serviceType === "rental" ? "Rental" : "Transfer"
    base = detail ? `${categoryLabel} ${detail}` : categoryLabel
  } else {
    return storedDescription
  }

  if (snapshot?.passengerKind === "child") return `${base} (Child)`
  if (snapshot?.passengerKind === "infant") return `${base} (Infant)`

  // A gifted night is missing from the line's qty, so the invoice says why rather than leaving a
  // four-night stay billed as three nights unexplained.
  const gifted = snapshot?.complimentaryNights ?? 0
  if (gifted > 0) {
    return `${base} (${gifted === 1 ? "first night complimentary" : `${gifted} nights complimentary`})`
  }

  if (snapshot?.isComplimentaryTransport === true) {
    return `${base} (complimentary)`
  }

  return base
}
