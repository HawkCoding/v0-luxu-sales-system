// Server-side loader for lib/quotes/quote-config.ts's pure resolver: gathers the
// supplier/route/rate-type lookups the resolver needs from the ids actually
// present on a set of quote line items, then resolves. Shared by every
// client-facing document (quote email, quote PDF, voucher, itinerary PDF) so
// none of them can derive a different journey/rate/train-only answer for the
// same quote.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { PricingSnapshot } from "@/lib/types"
import {
  resolveQuoteConfig,
  type QuoteConfig,
  type QuoteConfigLineItem,
  type QuoteConfigOverrides,
  type QuoteConfigRateTypeLookup,
  type QuoteConfigRouteLookup,
  type QuoteConfigSupplierLookup,
} from "@/lib/quotes/quote-config"

const NO_OVERRIDES: QuoteConfigOverrides = {
  journeyClass: null,
  rateAudience: null,
  showTrainOnlyNote: null,
}

/** journey_class / rate_audience / show_train_only_note as stored on quotes -- the quote's own
 * saved overrides, distinct from the derived Auto value. */
export interface QuoteConfigOverrideRow {
  journey_class: string | null
  rate_audience: string | null
  show_train_only_note: boolean | null
}

export function overridesFromQuoteRow(row: QuoteConfigOverrideRow | null | undefined): QuoteConfigOverrides {
  if (!row) return NO_OVERRIDES
  return {
    journeyClass: row.journey_class === "short" || row.journey_class === "long" ? row.journey_class : null,
    rateAudience:
      row.rate_audience === "international" || row.rate_audience === "resident" ? row.rate_audience : null,
    showTrainOnlyNote: row.show_train_only_note ?? null,
  }
}

/**
 * Resolves a QuoteConfig from line items already loaded by the caller, so a route
 * that has already queried quote_line_items never queries it twice.
 */
export async function loadQuoteConfig(
  supabase: SupabaseClient<Database>,
  input: {
    lineItems: readonly QuoteConfigLineItem[]
    overrides?: QuoteConfigOverrides
    /** Booking id to read bookings.primary_supplier_id from. Omit `bookingPrimarySupplierId`
     * entirely when the caller already has it (saves a query). */
    bookingId?: string
    bookingPrimarySupplierId?: string | null
  },
): Promise<QuoteConfig> {
  const supplierIds = new Set<string>()
  const routeIds = new Set<string>()
  const rateTypeIds = new Set<string>()

  for (const item of input.lineItems) {
    const snapshot = item.pricingSnapshot as PricingSnapshot | null | undefined
    if (!snapshot) continue
    if (snapshot.supplierId) supplierIds.add(snapshot.supplierId)
    if (snapshot.routeId) routeIds.add(snapshot.routeId)
    if (snapshot.rateTypeId) rateTypeIds.add(snapshot.rateTypeId)
  }

  const suppliers: Record<string, QuoteConfigSupplierLookup> = {}
  if (supplierIds.size > 0) {
    const { data } = await supabase
      .from("suppliers")
      .select("id, name, long_journey_min_days, sells_standalone")
      .in("id", [...supplierIds])
    for (const row of data ?? []) {
      suppliers[row.id] = {
        longJourneyMinDays: row.long_journey_min_days,
        sellsStandalone: row.sells_standalone ?? false,
        name: row.name,
      }
    }
  }

  // `== null` on purpose, not `=== undefined`: three callers pass `booking?.primary_supplier_id ?? null`,
  // so a booking they failed to load arrives here as an explicit null. Treating that as "the caller
  // told me there is none" silently dropped the hint and let a transfer extra win the primary
  // supplier. A caller that already has the id passes it and skips the query as before.
  let bookingPrimarySupplierId = input.bookingPrimarySupplierId ?? null
  if (input.bookingId && input.bookingPrimarySupplierId == null) {
    const { data: bookingRow } = await supabase
      .from("bookings")
      .select("primary_supplier_id")
      .eq("id", input.bookingId)
      .maybeSingle()
    bookingPrimarySupplierId = bookingRow?.primary_supplier_id ?? null
  }

  const routes: Record<string, QuoteConfigRouteLookup> = {}
  if (routeIds.size > 0) {
    const { data } = await supabase.from("routes").select("id, name, duration_days").in("id", [...routeIds])
    for (const row of data ?? []) {
      routes[row.id] = { durationDays: row.duration_days, name: row.name }
    }
  }

  const rateTypes: Record<string, QuoteConfigRateTypeLookup> = {}
  if (rateTypeIds.size > 0) {
    const { data } = await supabase.from("rate_types").select("id, audience").in("id", [...rateTypeIds])
    for (const row of data ?? []) {
      const audience = row.audience === "international" || row.audience === "resident" ? row.audience : null
      rateTypes[row.id] = { audience }
    }
  }

  return resolveQuoteConfig({
    lineItems: input.lineItems,
    suppliers,
    routes,
    rateTypes,
    overrides: input.overrides ?? NO_OVERRIDES,
    bookingPrimarySupplierId,
  })
}

const NEUTRAL_CONFIG: QuoteConfig = {
  primarySupplierId: null,
  primarySupplierSource: "none",
  primaryCandidateIds: [],
  primaryRouteId: null,
  primaryTrainRateTypeId: null,
  journeyClass: null,
  rateAudience: "international",
  trainOnly: false,
  auto: { journeyClass: true, rateAudience: true, trainOnly: true },
  unresolved: [],
}

/**
 * Resolves the QuoteConfig for a booking's accepted quote. Used by surfaces that
 * only have a bookingId (voucher, itinerary PDF) rather than a specific quote id.
 * Returns a neutral, unfiltering config when there is no accepted quote yet.
 */
export async function loadQuoteConfigForBooking(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<QuoteConfig> {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, journey_class, rate_audience, show_train_only_note")
    .eq("booking_id", bookingId)
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!quote) return NEUTRAL_CONFIG

  const { data: lineItems } = await supabase
    .from("quote_line_items")
    .select("pricing_snapshot")
    .eq("quote_id", quote.id)
    // Ordered because resolvePrimarySupplier's fallbacks are "first leg in array order" — an
    // unordered read lets Postgres decide who the primary supplier is, differently between calls.
    .order("sort_order", { ascending: true })

  return loadQuoteConfig(supabase, {
    lineItems: (lineItems ?? []).map((li) => ({ pricingSnapshot: li.pricing_snapshot as PricingSnapshot | null })),
    overrides: overridesFromQuoteRow(quote),
    bookingId,
  })
}

export interface QuoteDisplayTokens {
  /** {{rateLabel}} -- the rate named to the client (rate_types.client_label, falling back to
   * name), e.g. "SADC Resident special" for a rate whose internal name is "Rovos Rail SADC". */
  rateLabel: string | null
  /** {{trainOnlyNote}} -- suppliers.train_only_note, only when the quote resolved as train-only. */
  trainOnlyNote: string | null
}

/**
 * The two client-facing strings a per-train template body can reference, resolved from the ids a
 * QuoteConfig already carries. Kept separate from resolveQuoteConfig/loadQuoteConfig because these
 * are display text, not part of the journey/rate/train-only decision itself.
 */
export async function loadQuoteDisplayTokens(
  supabase: SupabaseClient<Database>,
  config: Pick<QuoteConfig, "primarySupplierId" | "primaryTrainRateTypeId" | "trainOnly">,
): Promise<QuoteDisplayTokens> {
  const [rateTypeResult, supplierResult] = await Promise.all([
    config.primaryTrainRateTypeId
      ? supabase.from("rate_types").select("name, client_label").eq("id", config.primaryTrainRateTypeId).maybeSingle()
      : Promise.resolve({ data: null }),
    config.trainOnly && config.primarySupplierId
      ? supabase.from("suppliers").select("train_only_note").eq("id", config.primarySupplierId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const rateType = rateTypeResult.data
  const rateLabel = rateType ? rateType.client_label?.trim() || rateType.name?.trim() || null : null
  const trainOnlyNote = supplierResult.data?.train_only_note?.trim() || null

  return { rateLabel, trainOnlyNote }
}
