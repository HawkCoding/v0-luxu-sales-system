import type { SupplierKind } from "@/lib/types"

/**
 * Kinds whose units (suites, rooms, cabins, tours) can each carry their own rate type
 * (booking_service_units.rate_type_id), overriding the leg's one value. A null unit rate inherits
 * the leg's, so a booking that never sets one prices exactly as before.
 *
 * Deliberately absent:
 * - airline: fares are typed by hand (manual pricing), so there is no rate card to pick between.
 * - transfers / vehicle_rental: they carry transport requests, not units.
 */
export const UNIT_RATE_TYPE_SUPPLIER_KINDS: ReadonlySet<SupplierKind> = new Set<SupplierKind>([
  "train_operator",
  "hotel_property",
  "cruise_line",
  "tour_operator",
])

export function supportsUnitRateType(kind: SupplierKind | string | null | undefined): boolean {
  return UNIT_RATE_TYPE_SUPPLIER_KINDS.has(kind as SupplierKind)
}

/**
 * The rate type a unit actually prices at: its own when this kind supports one, else the leg's.
 * A unit rate on a kind that doesn't support it is ignored rather than trusted -- the services
 * PATCH refuses to store one, so this only guards a stale or hand-crafted payload.
 */
export function effectiveUnitRateTypeId(
  kind: SupplierKind | string | null | undefined,
  unitRateTypeId: string | null | undefined,
  legRateTypeId: string | null | undefined,
): string | null {
  const unitRate = supportsUnitRateType(kind) ? unitRateTypeId ?? null : null
  return unitRate ?? legRateTypeId ?? null
}
