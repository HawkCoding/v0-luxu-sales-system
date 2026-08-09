import type { RateType, SupplierKind, SupplierKindDefaultRateType } from "@/lib/types"

/**
 * Resolve the default rate type id for a supplier.
 *
 * Order of precedence:
 *  1. The supplier's own override (if it points at an active rate type).
 *  2. The explicit per-kind mapping (if it points at an active rate type).
 *  3. The global default rate type (`isDefault`).
 *  4. The first active rate type.
 *
 * Pass `supplierDefaultRateTypeId: null` to resolve what a supplier would inherit if its own
 * override were cleared -- that is what the supplier edit form shows as the fallback.
 */
export function resolveDefaultRateTypeId(
  kind: SupplierKind,
  kindDefaults: SupplierKindDefaultRateType[],
  rateTypes: RateType[],
  supplierDefaultRateTypeId?: string | null,
): string | null {
  const active = rateTypes.filter((rt) => !rt.archivedAt)
  if (active.length === 0) return null

  const isActive = (rateTypeId: string | null | undefined) =>
    Boolean(rateTypeId) && active.some((rt) => rt.id === rateTypeId)

  if (isActive(supplierDefaultRateTypeId)) {
    return supplierDefaultRateTypeId ?? null
  }

  const mapped = kindDefaults.find((entry) => entry.kind === kind)?.rateTypeId
  if (isActive(mapped)) {
    return mapped ?? null
  }

  return active.find((rt) => rt.isDefault)?.id ?? active[0].id
}
