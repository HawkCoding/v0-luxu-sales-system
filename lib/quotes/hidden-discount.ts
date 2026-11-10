/**
 * The subtotal a quote or invoice prints once a hidden discount is folded into it.
 *
 * A visible discount prints as its own row under the full-price lines (full price, Discount, new
 * total). A hidden one has no row, so the lines above the total must already be net of it or they
 * would add up to more than the total printed under them. Anything else — no discount, or a
 * discount that is shown — leaves the subtotal untouched.
 */
export function subtotalNetOfHiddenDiscount(
  subtotal: number,
  discount: number | null | undefined,
  discountVisible: boolean | null | undefined,
): number {
  const hidden = discountVisible === false
  const amount = Number(discount ?? 0)
  if (!hidden || !Number.isFinite(amount) || amount <= 0) return subtotal
  return Math.max(0, Math.round((subtotal - amount) * 100) / 100)
}
