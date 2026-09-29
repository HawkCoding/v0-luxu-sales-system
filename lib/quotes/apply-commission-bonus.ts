import { roundMoney } from "@/lib/quotes/pricing-engine"
import type { CommissionKind, PricingSnapshot, QuoteLineItem } from "@/lib/types"

export const COMMISSION_LINE_DESCRIPTION = "Commission"

/** The single Commission line is the one carrying a commission breakdown in its snapshot. */
export function findCommissionLineIndex(lineItems: QuoteLineItem[]): number {
  return lineItems.findIndex((li) => li.pricingSnapshot?.commission != null)
}

const COMMISSION_KINDS: readonly CommissionKind[] = ["percent", "per_person", "fixed"]

/**
 * The commission type + value the quote currently carries on its Commission line (what the
 * Quotes-tab ledger shows and saves), or null when the quote has no Commission line. A Build
 * Booking re-price uses this so a ledger-set commission survives the rebuild instead of being
 * replaced by the house default. The amount is NOT reused — the caller re-prices it against the
 * new subtotal and the booking's current headcount.
 */
export function readQuoteCommissionSetting(
  pricingSnapshots: readonly unknown[],
): { type: CommissionKind; value: number } | null {
  for (const raw of pricingSnapshots) {
    const commission = (raw as PricingSnapshot | null)?.commission
    if (commission == null) continue
    const value = Number(commission.value)
    if (!COMMISSION_KINDS.includes(commission.type) || !Number.isFinite(value) || value < 0) return null
    return { type: commission.type, value }
  }
  return null
}

/**
 * The rand amount a salesperson manually added on top of the calculated commission,
 * as recorded on the line itself. Used to render the split without re-reading the quote.
 */
export function getCommissionBonus(lineItem: QuoteLineItem): number {
  return lineItem.pricingSnapshot?.commission?.bonus ?? 0
}

function bonusOnlySnapshot(bonus: number): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "",
    packageName: "",
    legId: null,
    legLabel: null,
    supplierId: null,
    supplierName: null,
    supplierKind: null,
    routeId: null,
    routeName: null,
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "",
    passengerKind: "service",
    baseUnitPrice: 0,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    commission: { type: "percent", value: 0, amount: 0, source: "line", bonus },
    unit: null,
  }
}

/**
 * Folds a flat, manually-typed rand amount into the quote's existing Commission line —
 * deliberately the same line, so the client never sees a second "Commission" row.
 *
 * The bonus is always applied against `commission.amount` (the calculated figure, stored
 * pre-bonus), so raising, lowering, or clearing it never compounds. When a bonus is present
 * the line collapses to qty 1 because the quote API recomputes `total = unitPrice * qty`,
 * and a flat booking-level amount cannot survive a per-person qty.
 *
 * Returns a new array; the input is not mutated.
 */
export function applyCommissionBonus(lineItems: QuoteLineItem[], bonus: number): QuoteLineItem[] {
  const normalizedBonus = Number.isFinite(bonus) ? roundMoney(bonus) : 0
  const index = findCommissionLineIndex(lineItems)

  if (index === -1) {
    if (normalizedBonus === 0) return [...lineItems]
    return [
      ...lineItems,
      {
        description: COMMISSION_LINE_DESCRIPTION,
        supplierDescription: null,
        qty: 1,
        unitPrice: normalizedBonus,
        total: normalizedBonus,
        pricingSnapshot: bonusOnlySnapshot(normalizedBonus),
      },
    ]
  }

  const line = lineItems[index]
  const snapshot = line.pricingSnapshot
  const commission = snapshot?.commission
  if (!snapshot || !commission) return [...lineItems]

  const baseAmount = roundMoney(commission.amount)
  const isPerPerson = commission.type === "per_person"
  // Older lines predate `passengerCount`; recover it from the amount so clearing a
  // bonus still restores a per-person line to its real qty.
  const passengerCount =
    commission.passengerCount ??
    (commission.value > 0 ? Math.round(baseAmount / commission.value) : 1)

  const next: QuoteLineItem =
    normalizedBonus !== 0
      ? {
          ...line,
          qty: 1,
          unitPrice: roundMoney(baseAmount + normalizedBonus),
          total: roundMoney(baseAmount + normalizedBonus),
          pricingSnapshot: {
            ...snapshot,
            commission: { ...commission, bonus: normalizedBonus },
            unit: null,
          },
        }
      : {
          // Restore the canonical shape the pricing engine would have produced.
          ...line,
          // The real count, even 0 — the quote API re-derives total as unitPrice × qty, so a
          // padded qty 1 would re-charge a 0-traveller per-person commission ×1.
          qty: isPerPerson ? passengerCount : 1,
          unitPrice: isPerPerson ? commission.value : baseAmount,
          total: baseAmount,
          pricingSnapshot: {
            ...snapshot,
            commission: { ...commission, bonus: 0 },
            unit: isPerPerson ? "per person" : null,
          },
        }

  const result = [...lineItems]
  result[index] = next
  return result
}
