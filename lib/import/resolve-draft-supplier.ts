import { resolveEntity } from "@/lib/matching/resolve-entity"
import type { MatchCandidateEntry } from "@/lib/matching/score-candidates"

/**
 * Resolve a parsed draft's free-text supplier wording against an already-loaded supplier pool.
 *
 * The server side of this (lib/resolvers/supplier-resolver.ts) fetches its own candidates from
 * Supabase; the review modal already holds the active train-operator list, so it resolves against
 * that same vocabulary through the same pure matcher. Client and server therefore agree by
 * construction, with no extra endpoint and no second, weaker matching rule.
 */
export function resolveDraftSupplierId(
  supplierText: string,
  suppliers: readonly MatchCandidateEntry[],
): string | null {
  return resolveEntity(supplierText, suppliers).value
}
