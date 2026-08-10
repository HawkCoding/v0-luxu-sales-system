import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"

/**
 * The accepted quote is the record of what the customer actually bought, so it — not whatever
 * is currently selected in the booking builder — decides which services appear on client
 * documents. The builder still supplies each service's operational detail (supplier
 * references, dates, times, pickup points), which the quote has never held and which is
 * captured after acceptance on the Voucher References tab.
 */
export interface AcceptedQuoteScope {
  quoteId: string | null
  quoteNumber: string | null
  /** Empty when there is no accepted quote, or it prices no legs (a manual/extras-only quote). */
  legIds: Set<string>
  /** Client-facing name per priced leg, for error messages that have to name a leg whose builder
   * row is gone. Keyed by leg id. */
  legLabels: Map<string, string>
  /** False when the booking has no accepted quote at all. */
  hasAcceptedQuote: boolean
}

interface LineItemSnapshotRow {
  pricing_snapshot: unknown
}

/**
 * Leg ids priced into a set of quote line items. Extras and manual lines carry no `legId` and
 * are skipped — an empty result therefore means "this quote prices no legs", which callers
 * treat as unfiltered rather than as an empty itinerary.
 */
export function legIdsFromLineItems(lineItems: readonly LineItemSnapshotRow[] | null): Set<string> {
  return new Set(
    (lineItems ?? [])
      .map((item) => (item.pricing_snapshot as PricingSnapshot | null)?.legId)
      .filter((legId): legId is string => Boolean(legId)),
  )
}

/** Best client-facing name per priced leg, preferring the leg's own label over its supplier. */
function legLabelsFromLineItems(lineItems: readonly LineItemSnapshotRow[] | null): Map<string, string> {
  const labels = new Map<string, string>()
  for (const item of lineItems ?? []) {
    const snapshot = item.pricing_snapshot as PricingSnapshot | null
    if (!snapshot?.legId || labels.has(snapshot.legId)) continue
    const label = snapshot.legLabel?.trim() || snapshot.supplierName?.trim()
    if (label) labels.set(snapshot.legId, label)
  }
  return labels
}

/**
 * Resolves the booking's accepted quote and the legs it priced.
 *
 * Quote selection deliberately mirrors `calculateInvoiceBalance` (newest `accepted` by
 * `created_at`) so a booking's invoice total and its documents can never disagree about which
 * quote is authoritative. A revision supersedes its parent, so in practice only one quote is
 * ever `accepted`; ordering is the tie-breaker if that invariant is ever broken.
 */
export async function resolveAcceptedQuoteScope(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<AcceptedQuoteScope> {
  const empty: AcceptedQuoteScope = {
    quoteId: null,
    quoteNumber: null,
    legIds: new Set<string>(),
    legLabels: new Map<string, string>(),
    hasAcceptedQuote: false,
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, quote_number")
    .eq("booking_id", bookingId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (quoteError) throw quoteError
  if (!quote) return empty

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("pricing_snapshot")
    .eq("quote_id", quote.id)

  if (lineItemsError) throw lineItemsError

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    legIds: legIdsFromLineItems(lineItems),
    legLabels: legLabelsFromLineItems(lineItems),
    hasAcceptedQuote: true,
  }
}

/**
 * Legs the accepted quote priced that no longer exist in the booking's builder, named for an
 * error message.
 *
 * Removing a service from Build Booking deletes the row outright and cascades away its units and
 * transport requests (app/api/jobs/[id]/build-booking/route.ts), taking the supplier references,
 * dates and pickup points the voucher would print with it. So a quoted leg with no surviving row
 * cannot be rendered at all — the caller must stop rather than ship a document that silently
 * omits a service the customer paid for.
 *
 * Returns empty when nothing was priced by leg, so manual quotes never trip this.
 */
export async function findMissingQuotedLegs(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  scope: AcceptedQuoteScope,
): Promise<string[]> {
  if (scope.legIds.size === 0) return []

  const [{ data: selections, error: selectionsError }, { data: services, error: servicesError }] =
    await Promise.all([
      supabase
        .from("booking_package_selections")
        .select("package_leg_id")
        .eq("booking_id", bookingId)
        .eq("selected", true),
      // A Build Booking service row is its own leg, so its id is what the snapshot recorded.
      supabase.from("booking_services").select("id").eq("booking_id", bookingId).eq("selected", true),
    ])

  if (selectionsError) throw selectionsError
  if (servicesError) throw servicesError

  const liveLegIds = new Set<string>([
    ...(selections ?? []).map((row) => row.package_leg_id),
    ...(services ?? []).map((row) => row.id),
  ])

  return [...scope.legIds]
    .filter((legId) => !liveLegIds.has(legId))
    .map((legId) => scope.legLabels.get(legId) ?? "Unnamed service")
}

/**
 * `legIds` to hand `buildVoucherServiceBlocks` / `loadLegReferenceRows` for a scope — undefined
 * (i.e. unfiltered) when the accepted quote prices no legs, matching the existing convention
 * that an empty set means "don't filter" rather than "render nothing".
 */
export function scopeLegIdsFilter(scope: AcceptedQuoteScope): Set<string> | undefined {
  return scope.legIds.size > 0 ? scope.legIds : undefined
}
