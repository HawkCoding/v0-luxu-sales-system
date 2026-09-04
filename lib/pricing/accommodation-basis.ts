import type { SupplierKind } from "@/lib/types"

/**
 * How a hotel stay prices: separate adult/child/infant fares per night ("per_person", the
 * long-standing default) or one flat nightly rate for the whole room whoever sleeps in it
 * ("per_room", opt-in per supplier). Mirrors the Postgres enum
 * public.accommodation_pricing_basis (supabase/migrations/20260904090000_hotel_room_pricing.sql).
 * Pure and sync so both the server pricer and the client-side leg editor resolve it identically.
 *
 * Deliberately a sibling of lib/pricing/transfer-basis.ts rather than a generalisation of it: the
 * two bases have different enums, different defaults and different rules about which supplier kind
 * may opt in, so a shared resolver would take a SupplierKind and immediately branch on it again.
 */
export type AccommodationPricingBasis = "per_person" | "per_room"

/**
 * Resolves the pricing basis for one booking_services row.
 *
 * - Any non-hotel kind is always per_person -- per-room pricing is scoped to hotels, and unlike
 *   transfers this cannot be a CHECK constraint because booking_services holds every supplier
 *   kind and the kind lives on `suppliers` (see the migration's trigger comment).
 * - An explicit row-level basis (set by the consultant, or already persisted on a saved stay)
 *   always wins -- this is what lets a stay keep the basis it was quoted under even after its
 *   supplier's default is later flipped.
 * - `supplierBasis` is the fallback for a brand-new row that hasn't been saved yet, the same
 *   value the DB's BEFORE INSERT trigger (stamp_booking_service_pricing_basis) would stamp.
 * - With neither, per_person -- note this default runs the opposite way to transfers, where the
 *   legacy basis was the flat one. Hotels have always priced per head, so per_person is the
 *   reading that leaves an existing stay's total unchanged.
 */
export function resolveAccommodationPricingBasis(input: {
  supplierKind: SupplierKind | null | undefined
  rowBasis: AccommodationPricingBasis | null | undefined
  supplierBasis: AccommodationPricingBasis | null | undefined
}): AccommodationPricingBasis {
  if (input.supplierKind !== "hotel_property") return "per_person"
  return input.rowBasis ?? input.supplierBasis ?? "per_person"
}

/**
 * Vocabulary label for a hotel's price basis -- the text a consultant reads beside a quote line's
 * quantity, and the reason SUPPLIER_VOCABULARY.hotel_property.priceLabel alone is not enough (it
 * is a static Record indexed by kind, and says "per room per night" for every hotel regardless of
 * how the line was actually priced). See lib/types.ts resolveSupplierPriceLabel.
 */
export function accommodationPriceLabel(basis: AccommodationPricingBasis): string {
  return basis === "per_room" ? "per room per night" : "per person per night"
}
