import type { PassengerTotals } from "@/lib/packages/passenger-totals"

/**
 * How a transfer prices: one flat amount for the whole vehicle ("per_vehicle", the long-standing
 * default) or separate adult/child/infant fares per vehicle category ("per_person", opt-in per
 * supplier). Mirrors the Postgres enum public.transport_pricing_basis
 * (supabase/migrations/20260827100000_transfer_per_person_pricing.sql). Pure and sync so both the
 * server pricer and the client-side leg editor resolve it identically.
 */
export type TransferPricingBasis = "per_vehicle" | "per_person"

/**
 * Resolves the pricing basis for one booking_transport_requests row.
 *
 * - A rental (or any non-transfer service type) is always per_vehicle -- per-person pricing is
 *   scoped to transfers only, enforced in the DB by
 *   booking_transport_requests_rental_basis_check.
 * - An explicit row-level basis (set by the consultant, or already persisted on a saved row)
 *   always wins -- this is what lets a transfer keep the basis it was created under even after
 *   its supplier's default is later flipped (see build-from-package.ts and the transport-requests
 *   PUT route's basis carry-forward).
 * - `supplierBasis` is the fallback for a brand-new row that hasn't been saved yet (and so has no
 *   rowBasis of its own) -- the same value the DB's BEFORE INSERT trigger
 *   (stamp_transport_request_pricing_basis) would stamp on insert.
 * - With neither, per_vehicle.
 */
export function resolveTransferPricingBasis(input: {
  serviceType: "transfer" | "rental" | "flight"
  rowBasis: TransferPricingBasis | null | undefined
  supplierBasis: TransferPricingBasis | null | undefined
}): TransferPricingBasis {
  if (input.serviceType !== "transfer") return "per_vehicle"
  return input.rowBasis ?? input.supplierBasis ?? "per_vehicle"
}

/**
 * Resolves the adult/child/infant split to price a per-person transfer row against.
 *
 * The fallback is per-ROW, not per-column: when all three counts are untouched (null), the row
 * prices against the booking's full projected totals. The moment the consultant types any one of
 * the three, the other two default to 0 rather than falling back individually -- otherwise typing
 * "2 adults" on a row meant to carry only part of the party would silently inherit the booking's
 * full child/infant counts too.
 */
export function resolveTransferPax(
  row: { adultCount: number | null; childCount: number | null; infantCount: number | null },
  fallback: PassengerTotals,
): PassengerTotals {
  if (row.adultCount === null && row.childCount === null && row.infantCount === null) {
    return fallback
  }
  return {
    adultCount: row.adultCount ?? 0,
    childCount: row.childCount ?? 0,
    infantCount: row.infantCount ?? 0,
  }
}

/** Vocabulary label for a transfer's price basis, e.g. in the rate-card period header and the
 * leg editor's collapsed override summary. Transfers only -- rentals keep their own label from
 * SUPPLIER_VOCABULARY (see lib/types.ts resolveSupplierPriceLabel). */
export function transferPriceLabel(basis: TransferPricingBasis): string {
  return basis === "per_person" ? "per person" : "per vehicle"
}
