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
  /** Legs the supplier comped outright (manualRoomPrice of 0). */
  complimentaryLegIds: Set<string>
  /** Legs where the first night was gifted and the rest charged. */
  firstNightComplimentaryLegIds: Set<string>
  /** Transport requests marked complimentary — per request, not per leg. */
  complimentaryTransportRequestIds: Set<string>
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

/**
 * Leg ids whose room price was deliberately typed as R0 (the supplier comped the whole stay —
 * see the price override in suite-leg-editor.tsx / manualRoomPrice). Subset of
 * `legIdsFromLineItems` — used to flag the "COMPLIMENTARY" callout on client documents.
 */
export function complimentaryLegIdsFromLineItems(lineItems: readonly LineItemSnapshotRow[] | null): Set<string> {
  return new Set(
    (lineItems ?? [])
      .filter((item) => (item.pricing_snapshot as PricingSnapshot | null)?.manualRoomPrice === 0)
      .map((item) => (item.pricing_snapshot as PricingSnapshot | null)?.legId)
      .filter((legId): legId is string => Boolean(legId)),
  )
}

/**
 * Leg ids where the hotel gifted the first night and charged the rest (see
 * "Mark first night complimentary" in suite-leg-editor.tsx). Kept apart from the fully comped set
 * above because the client-facing callout differs: the stay is still charged, just one night
 * shorter on the invoice than in the itinerary.
 */
export function firstNightComplimentaryLegIdsFromLineItems(
  lineItems: readonly LineItemSnapshotRow[] | null,
): Set<string> {
  return new Set(
    (lineItems ?? [])
      .filter((item) => {
        const nights = (item.pricing_snapshot as PricingSnapshot | null)?.complimentaryNights
        return typeof nights === "number" && nights > 0
      })
      .map((item) => (item.pricing_snapshot as PricingSnapshot | null)?.legId)
      .filter((legId): legId is string => Boolean(legId)),
  )
}

/**
 * Transport request ids whose trip was deliberately marked complimentary (see the toggle in
 * transport-leg-editor.tsx / booking_transport_requests.complimentary). Unlike hotels, a
 * complimentary transfer is per-request, not per-leg — one leg can have several captured trips,
 * only some of which are comped — so this keys off `transportRequestId`, not `legId`.
 */
export function complimentaryTransportRequestIdsFromLineItems(
  lineItems: readonly LineItemSnapshotRow[] | null,
): Set<string> {
  return new Set(
    (lineItems ?? [])
      .filter((item) => (item.pricing_snapshot as PricingSnapshot | null)?.isComplimentaryTransport === true)
      .map((item) => (item.pricing_snapshot as PricingSnapshot | null)?.transportRequestId)
      .filter((requestId): requestId is string => Boolean(requestId)),
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
    complimentaryLegIds: new Set<string>(),
    firstNightComplimentaryLegIds: new Set<string>(),
    complimentaryTransportRequestIds: new Set<string>(),
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
    // Ordered so `legLabels` keeps the itinerary's own order rather than Postgres's.
    .order("sort_order", { ascending: true })

  if (lineItemsError) throw lineItemsError

  // The comp sets travel with the scope rather than being re-extracted per caller. Leaving them out
  // is what let the voucher print no COMPLIMENTARY callouts at all while the quote PDF and the
  // quote email both printed them: `voucher/generate` builds its blocks from this scope, and the
  // scope simply had nothing to tell it.
  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    legIds: legIdsFromLineItems(lineItems),
    legLabels: legLabelsFromLineItems(lineItems),
    complimentaryLegIds: complimentaryLegIdsFromLineItems(lineItems),
    firstNightComplimentaryLegIds: firstNightComplimentaryLegIdsFromLineItems(lineItems),
    complimentaryTransportRequestIds: complimentaryTransportRequestIdsFromLineItems(lineItems),
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

  // A service row is its own leg, so its id is what the snapshot recorded.
  const { data: services, error: servicesError } = await supabase
    .from("booking_services")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("selected", true)

  if (servicesError) throw servicesError

  const liveLegIds = new Set<string>((services ?? []).map((row) => row.id))

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
