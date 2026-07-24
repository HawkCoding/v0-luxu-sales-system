import type { QuoteLineItem } from "@/lib/types"

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateQuoteTotals(lineItems: QuoteLineItem[]) {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0))

  return { subtotal, total: subtotal }
}

export function isPricingEngineLineItem(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.source === "pricing_engine"
}

/**
 * A line that is zero-priced because it is an inclusion of a fixed-price
 * package — the price sits on that package's "Package Total" line, not here.
 * Distinct from a line that is zero because nobody has priced it yet.
 */
export function isFixedPackageInclusion(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.pricingMode === "fixed_package"
}

/** True when a line is zero-priced for a reason the quote still needs resolved. */
export function isMissingPricing(lineItem: QuoteLineItem): boolean {
  return lineItem.unitPrice === 0 && !isFixedPackageInclusion(lineItem)
}
