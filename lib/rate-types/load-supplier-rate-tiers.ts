import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { mapRateType } from "@/lib/suppliers"
import {
  resolveSupplierRateTiers,
  type SupplierRateTierSource,
  type SupplierRateTiers,
} from "@/lib/rate-types/supplier-rate-tiers"

/** Resolves one supplier's rate tiers. See resolveSupplierRateTiers for the fallbacks. */
export type SupplierRateTiersResolver = (
  supplier: SupplierRateTierSource & {
    /** Pass this to have the supplier's own rate markdowns resolved into applicableRateTypeIds. */
    supplierId?: string
  },
) => SupplierRateTiers

/**
 * Loads the active rate types once and returns a resolver the caller can run per leg. Quote-building
 * paths touch many legs across several suppliers, so this keeps that to a single query.
 *
 * The supplier markdown rows come along for the ride so a caller that passes `supplierId` gets the
 * set of rates that supplier actually prices at, without a per-leg round trip.
 */
export async function loadSupplierRateTiersResolver(
  supabase: SupabaseClient<Database>,
): Promise<SupplierRateTiersResolver> {
  const [{ data: rateTypeRows }, { data: adjustmentRows }] = await Promise.all([
    supabase.from("rate_types").select("*").is("archived_at", null),
    supabase.from("supplier_rate_adjustments").select("supplier_id, rate_type_id"),
  ])
  const rateTypes = (rateTypeRows ?? []).map(mapRateType)

  const adjustmentsBySupplierId = new Map<string, string[]>()
  for (const row of adjustmentRows ?? []) {
    const list = adjustmentsBySupplierId.get(row.supplier_id) ?? []
    list.push(row.rate_type_id)
    adjustmentsBySupplierId.set(row.supplier_id, list)
  }

  return ({ supplierId, ...supplier }) =>
    resolveSupplierRateTiers(rateTypes, {
      ...supplier,
      adjustmentRateTypeIds:
        supplier.adjustmentRateTypeIds ??
        (supplierId ? adjustmentsBySupplierId.get(supplierId) ?? [] : undefined),
    })
}
