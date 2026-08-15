import type { RateType } from "@/lib/types"

/**
 * The two rate types a supplier contributes to pricing, resolved against the live rate-type list.
 *
 * `baseRateTypeId` is the supplier's own starting price — the baseline every rate markdown on the
 * supplier is measured off. `quoteRateTypeId` is the rate its quotes should use; null means "use
 * the base rate", so a supplier that has never nominated one behaves exactly as before.
 */
export interface SupplierRateTiers {
  baseRateTypeId: string | null
  quoteRateTypeId: string | null
  /** Display name of what an un-chosen leg inherits: the quoted rate where set, else the base. */
  inheritedRateTypeName: string | null
  /**
   * Every rate type this supplier actually prices at -- its base rate plus the rates it has a
   * markdown for (the "Applicable Rates" card). Null when the caller passed no adjustments, which
   * means "unknown", not "none": consumers must not filter on it in that case.
   */
  applicableRateTypeIds: string[] | null
}

export interface SupplierRateTierSource {
  baseRateTypeId?: string | null
  quoteRateTypeId?: string | null
  /** Rate types this supplier has a markdown row for. Omit when they haven't been loaded. */
  adjustmentRateTypeIds?: string[]
}

/**
 * Resolve a supplier's base and quoted rate types.
 *
 * The base rate falls back to the system default (`isDefault`) and then to the first active rate
 * type, so pricing always has a baseline to work from. Both fields ignore ids that point at an
 * archived or deleted rate type: a stale pointer must not shadow a live default, and an archived
 * quoted rate silently degrades to the base rate rather than failing a quote.
 */
export function resolveSupplierRateTiers(
  rateTypes: RateType[],
  supplier: SupplierRateTierSource = {},
): SupplierRateTiers {
  const active = rateTypes.filter((rt) => !rt.archivedAt)
  if (active.length === 0) {
    return {
      baseRateTypeId: null,
      quoteRateTypeId: null,
      inheritedRateTypeName: null,
      applicableRateTypeIds: supplier.adjustmentRateTypeIds ? [] : null,
    }
  }

  const activeId = (rateTypeId: string | null | undefined) =>
    rateTypeId && active.some((rt) => rt.id === rateTypeId) ? rateTypeId : null

  const baseRateTypeId =
    activeId(supplier.baseRateTypeId) ?? active.find((rt) => rt.isDefault)?.id ?? active[0].id

  // Quoting at the base rate is the same thing as not nominating one, so it is normalised to null
  // and callers only have to handle the "different from base" case.
  const nominated = activeId(supplier.quoteRateTypeId)
  const quoteRateTypeId = nominated === baseRateTypeId ? null : nominated
  const inheritedId = quoteRateTypeId ?? baseRateTypeId

  // The base rate leads: it is the one tier a supplier always prices at, so a leg can always fall
  // back to it even when no markdown has been captured yet. Anything archived or deleted is
  // dropped the same way the tiers above are.
  const applicableRateTypeIds = supplier.adjustmentRateTypeIds
    ? [
        baseRateTypeId,
        ...active
          .filter(
            (rt) => rt.id !== baseRateTypeId && supplier.adjustmentRateTypeIds?.includes(rt.id),
          )
          .map((rt) => rt.id),
      ]
    : null

  return {
    baseRateTypeId,
    quoteRateTypeId,
    inheritedRateTypeName: active.find((rt) => rt.id === inheritedId)?.name ?? null,
    applicableRateTypeIds,
  }
}
