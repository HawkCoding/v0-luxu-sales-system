import type { RateType, SupplierKind, SupplierKindDefaultRateType } from "@/lib/types"

/**
 * Resolve the default rate type id for a supplier kind.
 *
 * Order of precedence:
 *  1. The explicit per-kind mapping (if it points at an active rate type).
 *  2. The global default rate type (`isDefault`).
 *  3. The first active rate type.
 */
export function resolveDefaultRateTypeId(
  kind: SupplierKind,
  kindDefaults: SupplierKindDefaultRateType[],
  rateTypes: RateType[],
): string | null {
  const active = rateTypes.filter((rt) => !rt.archivedAt)
  if (active.length === 0) return null

  const mapped = kindDefaults.find((entry) => entry.kind === kind)?.rateTypeId
  if (mapped && active.some((rt) => rt.id === mapped)) {
    return mapped
  }

  return active.find((rt) => rt.isDefault)?.id ?? active[0].id
}
