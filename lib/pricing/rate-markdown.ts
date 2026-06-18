/**
 * Apply a supplier rate markdown to a base (default-rate) price.
 *
 * `discountPct` is the percentage cheaper the rate is than the default rate,
 * e.g. a base of 1000 with a 20% markdown resolves to 800, and a 50% markdown
 * resolves to 500. The result is rounded to two decimal places.
 */
export function applyRateMarkdown(basePrice: number, discountPct: number): number {
  const factor = 1 - discountPct / 100
  return Math.round(basePrice * factor * 100) / 100
}
