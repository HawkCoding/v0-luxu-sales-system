import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PipelineStage } from "@/lib/types"
import { resolveAcceptedQuoteScope, scopeLegIdsFilter } from "@/lib/quotes/accepted-quote-scope"
import { loadLegReferenceRows } from "@/lib/voucher/leg-references"
import { getCrossedForwardStages, type TransitionLegReference } from "@/lib/pipeline/validate-transition"

/**
 * Loads the legs the `voucher_sent` reference gate judges — but only when the move actually
 * crosses that stage, so every other stage transition stays at its current query count.
 *
 * Scoped identically to the Voucher Details tab's own GET (`resolveAcceptedQuoteScope` +
 * `scopeLegIdsFilter`), which is what keeps the gate and the tab in agreement: a consultant is
 * never blocked on a reference for a service the customer did not buy, and the tab never shows a
 * row the gate ignores.
 */
export async function loadTransitionLegReferences(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  fromStage: PipelineStage,
  targetStage: PipelineStage,
): Promise<TransitionLegReference[]> {
  if (!getCrossedForwardStages(fromStage, targetStage).includes("voucher_sent")) return []

  const quoteScope = await resolveAcceptedQuoteScope(supabase, bookingId)
  const rows = await loadLegReferenceRows(supabase, bookingId, {
    legIds: scopeLegIdsFilter(quoteScope),
  })

  return rows.map((row) => ({ label: row.label, supplierReference: row.supplierReference }))
}
