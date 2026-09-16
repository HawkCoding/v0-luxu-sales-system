import { buildCommissionBreakdown, calculateCommissionAmount } from "@/lib/pricing/commission"
import { applyCommissionBonus, findCommissionLineIndex } from "@/lib/quotes/apply-commission-bonus"
import { calculateQuoteTotals, roundMoney } from "@/lib/quotes/pricing-engine"
import type { CommissionKind, QuoteLineItem } from "@/lib/types"

const MAX_ADJUSTMENT_VALUE = 1_000_000

export interface QuoteAdjustmentsInput {
  /** null means "no commission configured" — any existing Commission line is dropped. */
  commission: { type: CommissionKind; value: number } | null
  /** Flat manual top-up folded into the Commission line. Always >= 0 (negative is a validation error). */
  commissionBonus: number
  /** Positive magnitude of the agency discount, in the quote's currency. */
  agentCommission: number
  /** null means "no discount configured". */
  discount: { type: CommissionKind; value: number; visible: boolean } | null
  /** Booking headcount, used as the passenger-count fallback when no commission breakdown
   *  exists yet to read one off. */
  bookingHeadcount: number
}

export interface QuoteAdjustmentsResult {
  lineItems: QuoteLineItem[]
  /** Sum of every line except Commission — the "Services" row in the ledger. */
  servicesSubtotal: number
  commissionAmount: number
  /** quotes.subtotal — every line including Commission, before Agent Commission/Discount. */
  subtotal: number
  agentCommission: number
  discountAmount: number
  /** quotes.total — subtotal minus Agent Commission and Discount, floored at 0. */
  total: number
  /** Validation problems. A non-empty array means the caller must not save this state. */
  errors: string[]
}

/**
 * The single source of truth for what Commission, Rounding, Agent Commission and Discount do to
 * a quote's line items and totals. Both the adjustments API route and the ledger's live preview
 * call this with the same inputs, so what the salesperson sees while editing is exactly what gets
 * saved.
 *
 * Discount is deliberately resolved against the subtotal THIS call produces after Commission but
 * BEFORE Rounding — Rounding is applied last, so nudging it never changes the Discount amount. A
 * Commission change still keeps a percent/per_person Discount lined up with the new subtotal; the
 * old per-field routes couldn't do this: editing Commission alone re-used quotes.discount_amount
 * unchanged.
 */
export function computeQuoteAdjustments(
  currentLineItems: QuoteLineItem[],
  input: QuoteAdjustmentsInput,
): QuoteAdjustmentsResult {
  const errors: string[] = []

  const commissionIndex = findCommissionLineIndex(currentLineItems)
  const existingSnapshot = commissionIndex >= 0 ? currentLineItems[commissionIndex].pricingSnapshot : null
  const existingBreakdown = existingSnapshot?.commission ?? null

  // The commission base is the subtotal of every OTHER line — never the Commission line's own
  // (bonus-inclusive) total, or a bonus already folded in would compound each save.
  const servicesSubtotal = roundMoney(
    currentLineItems.reduce((sum, li, idx) => (idx === commissionIndex ? sum : sum + li.total), 0),
  )

  let lineItemsWithCommission: QuoteLineItem[]
  let commissionAmount = 0

  if (input.commission) {
    if (input.commission.value < 0 || input.commission.value > MAX_ADJUSTMENT_VALUE) {
      errors.push("Enter a valid commission value.")
    }
    const passengerCount =
      existingBreakdown?.passengerCount ?? (input.bookingHeadcount > 0 ? input.bookingHeadcount : 1)
    commissionAmount = calculateCommissionAmount({
      amountAfterMarkup: servicesSubtotal,
      passengerCount,
      resolved: { type: input.commission.type, value: input.commission.value, source: "line" },
    })
    const isPerPerson = input.commission.type === "per_person"
    const nextBreakdown = buildCommissionBreakdown(
      { type: input.commission.type, value: input.commission.value, source: "line" },
      commissionAmount,
      passengerCount,
    )
    const commissionLine: QuoteLineItem = {
      description: "Commission",
      supplierDescription: null,
      qty: isPerPerson ? Math.max(1, passengerCount) : 1,
      unitPrice: isPerPerson ? input.commission.value : commissionAmount,
      total: commissionAmount,
      pricingSnapshot: existingSnapshot
        ? {
            ...existingSnapshot,
            baseUnitPrice: isPerPerson ? input.commission.value : commissionAmount,
            commission: nextBreakdown,
            unit: isPerPerson ? "per person" : null,
          }
        : {
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
            baseUnitPrice: isPerPerson ? input.commission.value : commissionAmount,
            markupPct: 0,
            singleSupplementPct: null,
            serviceType: null,
            commission: nextBreakdown,
            unit: isPerPerson ? "per person" : null,
          },
    }
    lineItemsWithCommission =
      commissionIndex >= 0
        ? currentLineItems.map((li, idx) => (idx === commissionIndex ? commissionLine : li))
        : [...currentLineItems, commissionLine]
  } else {
    // No commission configured — drop any existing Commission line entirely.
    lineItemsWithCommission =
      commissionIndex >= 0 ? currentLineItems.filter((_, idx) => idx !== commissionIndex) : [...currentLineItems]
  }

  const bonus = Number.isFinite(input.commissionBonus) ? roundMoney(input.commissionBonus) : 0
  if (bonus < 0) errors.push("Rounding can't be negative — use a discount instead.")
  if (bonus > MAX_ADJUSTMENT_VALUE) errors.push("Enter a valid rounding amount.")
  const nextLineItems = applyCommissionBonus(lineItemsWithCommission, Math.max(0, bonus))

  // Discount is resolved against the pre-Rounding subtotal so that adjusting Rounding never
  // moves the Discount amount; Rounding is folded in last, only for the final Total.
  const { subtotal: subtotalBeforeRounding } = calculateQuoteTotals(lineItemsWithCommission)
  const { subtotal } = calculateQuoteTotals(nextLineItems)

  const agentCommission = Number.isFinite(input.agentCommission) ? roundMoney(input.agentCommission) : 0
  if (agentCommission < 0 || agentCommission > MAX_ADJUSTMENT_VALUE) {
    errors.push("Enter a valid Agent Commission amount.")
  }

  let discountAmount = 0
  if (input.discount) {
    if (input.discount.value < 0 || input.discount.value > MAX_ADJUSTMENT_VALUE) {
      errors.push("Enter a valid discount value.")
    }
    let passengerCount = 1
    if (input.discount.type === "per_person") {
      const commissionIndexAfter = findCommissionLineIndex(nextLineItems)
      const snapshotCommission =
        commissionIndexAfter >= 0 ? nextLineItems[commissionIndexAfter].pricingSnapshot?.commission : null
      if (snapshotCommission?.passengerCount) passengerCount = snapshotCommission.passengerCount
    }
    discountAmount = calculateCommissionAmount({
      amountAfterMarkup: subtotalBeforeRounding,
      passengerCount,
      resolved: { type: input.discount.type, value: input.discount.value, source: "line" },
    })
  }

  if (Math.max(0, agentCommission) + discountAmount > subtotal) {
    errors.push("Agent Commission and Discount together cannot exceed the quote subtotal.")
  }

  const { total } = calculateQuoteTotals(nextLineItems, agentCommission, discountAmount)

  return {
    lineItems: nextLineItems,
    servicesSubtotal,
    commissionAmount,
    subtotal,
    agentCommission,
    discountAmount,
    total,
    errors,
  }
}
