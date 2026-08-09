import type { SupplierRateAdjustment } from "@/lib/types"

/**
 * Rebuild a supplier's rate adjustments after its default rate type changes.
 *
 * Every stored discount_pct means "% off the old default", so none of them survive a change of
 * baseline. They are not recomputed: expressing an old markdown against a cheaper new baseline
 * needs a markup, and discount_pct is constrained to 0-100. They are zeroed instead, for the user
 * to retype.
 *
 * Two structural rules fall out of that:
 *  - the incoming default is dropped, because the baseline is the implicit 0% and is never stored;
 *  - the outgoing default is added back at 0%, so the rate cards already tagged with it keep a tab
 *    in the pricing matrix (which derives its tabs from default + adjustments).
 */
export function rebaseRateAdjustments(
  adjustments: SupplierRateAdjustment[],
  previousDefaultRateTypeId: string | null,
  nextDefaultRateTypeId: string,
): SupplierRateAdjustment[] {
  const carried =
    previousDefaultRateTypeId && previousDefaultRateTypeId !== nextDefaultRateTypeId
      ? [{ rateTypeId: previousDefaultRateTypeId, discountPct: 0 }]
      : []

  return [
    ...carried,
    ...adjustments
      .filter((adjustment) => adjustment.rateTypeId !== nextDefaultRateTypeId)
      .filter((adjustment) => adjustment.rateTypeId !== previousDefaultRateTypeId)
      .map((adjustment) => ({ ...adjustment, discountPct: 0 })),
  ]
}
