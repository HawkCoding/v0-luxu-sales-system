import type { SupabaseClient } from "@supabase/supabase-js"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { loadRateShortLabels } from "@/lib/quotes/load-rate-short-labels"
import {
  allocatePaxGroups,
  paxGroupScopeTag,
  readPaxGroups,
  type PaxGroupPricing,
  type PaxGroupPricingLine,
} from "@/lib/quotes/pax-group-pricing"
import type { ItineraryScopeTag } from "@/lib/quotes/quote-presentation"
import type { Database } from "@/lib/supabase/types"

interface ResolvePaxGroupPricingInput {
  /** The quote's priced lines (quote_line_items rows), commission line included. */
  lines: readonly PaxGroupPricingLine[]
  /** The figure the group subtotals add up to: the GROSS subtotal (quotes.subtotal ?? quotes.total
   *  on a quote, totals.subtotalInclVat on an invoice). */
  target: number
}

/**
 * The per-suite price lines a quote or invoice prints in place of "Total per Adult / Child" — the
 * lines' rate short labels ("SA", "TW") looked up, then allocatePaxGroups. Null keeps the document's
 * existing rows: a booking with no pax groups, a quote built before them, or anything that fails on
 * the way. Never throws — a document must never fail to build over this.
 */
export async function resolvePaxGroupPricing(
  supabase: SupabaseClient<Database>,
  { lines, target }: ResolvePaxGroupPricingInput,
): Promise<PaxGroupPricing | null> {
  try {
    if (!readPaxGroups(lines)) return null
    const rateLabels = await loadRateShortLabels(supabase, lines)
    return allocatePaxGroups({ lines, target, rateLabels })
  } catch {
    return null
  }
}

/** A transport request's own tag first (a leg can carry one trip for Suite 3 and one for everyone),
 *  then its leg's — the only answer when the lines predate per-trip stamping. */
function scopeTagFor(
  lines: readonly { pricing_snapshot: unknown }[],
  ids: { legId?: string | null; transportRequestId?: string | null },
  noun: string,
): string | null {
  return (
    (ids.transportRequestId ? paxGroupScopeTag(lines, ids.transportRequestId, noun) : null) ??
    paxGroupScopeTag(lines, ids.legId ?? null, noun)
  )
}

/**
 * The itinerary's "(Suite 2 only)" tagger for these lines: a transfer/flight block is matched by its
 * own transport request, every other block by its leg. Undefined on a booking without pax groups, so
 * callers pass it straight through and every sentence stays as it was.
 */
export function blockScopeTagger(
  lines: readonly { pricing_snapshot: unknown }[],
  noun = "Suite",
): ItineraryScopeTag | undefined {
  if (!readPaxGroups(lines)) return undefined
  return (block: VoucherServiceBlock) => scopeTagFor(lines, block, noun)
}

/**
 * The same tag for one priced line (an invoice description row): its own transport request when it
 * priced one, else its leg. Null on a booking without groups or a line every group shares.
 */
export function lineScopeTag(
  lines: readonly { pricing_snapshot: unknown }[],
  snapshot: { legId?: string | null; transportRequestId?: string | null } | null | undefined,
  noun = "Suite",
): string | null {
  return snapshot ? scopeTagFor(lines, snapshot, noun) : null
}
