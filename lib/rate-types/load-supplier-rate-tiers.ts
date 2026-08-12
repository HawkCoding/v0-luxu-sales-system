import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { mapRateType } from "@/lib/suppliers"
import {
  resolveSupplierRateTiers,
  type SupplierRateTierSource,
  type SupplierRateTiers,
} from "@/lib/rate-types/supplier-rate-tiers"

/** Resolves one supplier's rate tiers. See resolveSupplierRateTiers for the fallbacks. */
export type SupplierRateTiersResolver = (supplier: SupplierRateTierSource) => SupplierRateTiers

/**
 * Loads the active rate types once and returns a resolver the caller can run per leg. Quote-building
 * paths touch many legs across several suppliers, so this keeps that to a single query.
 */
export async function loadSupplierRateTiersResolver(
  supabase: SupabaseClient<Database>,
): Promise<SupplierRateTiersResolver> {
  const { data: rateTypeRows } = await supabase.from("rate_types").select("*").is("archived_at", null)
  const rateTypes = (rateTypeRows ?? []).map(mapRateType)

  return (supplier) => resolveSupplierRateTiers(rateTypes, supplier)
}
