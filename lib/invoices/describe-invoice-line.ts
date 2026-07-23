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
  const supplier = snapshot?.supplierName?.trim() || snapshot?.legLabel?.trim() || null
  if (!supplier) return storedDescription

  // Invoice PDF renders with the core Helvetica font (WinAnsi-only, no arrow glyph),
  // so routeName's "→"/"↔" must be swapped for a word here or it renders as garbage.
  const detail = snapshot?.routeName?.trim().replace(/\s*[→↔]\s*/g, " to ") || null
  const base = detail ? `${supplier} — ${detail}` : supplier

  if (snapshot?.passengerKind === "child") return `${base} (Child)`
  if (snapshot?.passengerKind === "infant") return `${base} (Infant)`
  return base
}
