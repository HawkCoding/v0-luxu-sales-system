import { roundMoney } from "@/lib/quotes/pricing-engine"
import type { PricingSnapshot } from "@/lib/types"

/** A quote_line_items row (or the subset this module needs). */
export interface FoldableLineItem {
  description: string
  qty: number | null
  unit_price: number | null
  total: number | null
  pricing_snapshot: unknown
}

function isCommissionLine(item: FoldableLineItem): boolean {
  const snapshot = item.pricing_snapshot as PricingSnapshot | null
  return snapshot?.commission != null
}

/**
 * The client-facing invoice must never show the internal "Commission" line item — but simply
 * dropping the row would make the printed lines stop summing to the subtotal. Instead, fold each
 * commission row's total into the largest remaining travel line, so the visible arithmetic still
 * reconciles. If every line is a commission line (nothing to fold into), leave them as-is rather
 * than emit an invoice with no items.
 */
export function foldCommissionLines<T extends FoldableLineItem>(lineItems: T[]): T[] {
  const commissionLines = lineItems.filter(isCommissionLine)
  if (commissionLines.length === 0) return lineItems

  const remaining = lineItems.filter((item) => !isCommissionLine(item))
  if (remaining.length === 0) return lineItems

  const commissionTotal = roundMoney(
    commissionLines.reduce((sum, item) => sum + Number(item.total ?? 0), 0),
  )

  let targetIndex = 0
  let targetTotal = Number(remaining[0].total ?? 0)
  for (let i = 1; i < remaining.length; i++) {
    const total = Number(remaining[i].total ?? 0)
    if (total > targetTotal) {
      targetIndex = i
      targetTotal = total
    }
  }

  const target = remaining[targetIndex]
  const pax = Number(target.qty ?? 0)
  const newTotal = roundMoney(Number(target.total ?? 0) + commissionTotal)

  remaining[targetIndex] = {
    ...target,
    total: newTotal,
    unit_price: pax > 0 ? roundMoney(newTotal / pax) : newTotal,
  }

  return remaining
}
