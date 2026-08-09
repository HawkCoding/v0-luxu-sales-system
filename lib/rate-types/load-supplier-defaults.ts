import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { mapRateType } from "@/lib/suppliers"
import { resolveDefaultRateTypeId } from "@/lib/rate-types/default-rate-type"
import type { SupplierKind } from "@/lib/types"

/** Resolves one supplier's default rate type. See resolveDefaultRateTypeId for the precedence. */
export type SupplierDefaultRateTypeResolver = (
  kind: SupplierKind,
  supplierDefaultRateTypeId: string | null,
) => string | null

/**
 * Loads the two org-wide tables the supplier-default chain needs (active rate types and the
 * per-kind mapping) once, and returns a resolver the caller can run per leg. Quote-building paths
 * touch many legs across several suppliers, so this keeps that to a fixed two queries.
 */
export async function loadSupplierDefaultRateTypeResolver(
  supabase: SupabaseClient<Database>,
): Promise<SupplierDefaultRateTypeResolver> {
  const [{ data: rateTypeRows }, { data: kindRows }] = await Promise.all([
    supabase.from("rate_types").select("*").is("archived_at", null),
    supabase.from("supplier_kind_default_rate_types").select("*"),
  ])

  const rateTypes = (rateTypeRows ?? []).map(mapRateType)
  const kindDefaults = (kindRows ?? []).map((row) => ({
    kind: row.kind as SupplierKind,
    rateTypeId: row.rate_type_id,
  }))

  return (kind, supplierDefaultRateTypeId) =>
    resolveDefaultRateTypeId(kind, kindDefaults, rateTypes, supplierDefaultRateTypeId)
}
