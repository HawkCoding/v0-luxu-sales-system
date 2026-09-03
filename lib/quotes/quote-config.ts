// Resolves the per-quote email/PDF configuration that varies by train: journey
// length (short/long), rate audience (international/resident) and whether the
// train-only closing note applies. Pure -- callers load the lookups from the DB
// and pass them in. Every axis is "derive, unless the quote carries an explicit
// override" (lib/quotes/quote-preview-send-dialog config panel writes the
// overrides; null means "follow Auto").
//
// The template variant itself is not resolved here: this module exposes
// primarySupplierId, and lib/templates/get-template.ts does the (key, supplierId)
// lookup, because that requires knowing which template rows actually exist.

import {
  resolvePrimaryRoute,
  resolvePrimarySupplier,
  type PrimarySupplierSource,
} from "@/lib/quotes/resolve-primary-route"
import type { PricingSnapshot, SupplierKind } from "@/lib/types"

export type JourneyClass = "short" | "long"
export type RateAudience = "international" | "resident"

const DEFAULT_RATE_AUDIENCE: RateAudience = "international"

export interface QuoteConfigLineItem {
  pricingSnapshot?: PricingSnapshot | null
}

/** Per-supplier rule: suppliers.long_journey_min_days. Null = no short/long concept. */
export interface QuoteConfigSupplierLookup {
  longJourneyMinDays: number | null
  /** suppliers.sells_standalone -- may this supplier head a booking (and carry its own template
   * variant) rather than only ever being an add-on leg. */
  sellsStandalone: boolean
  /** Display name, for the ambiguous-primary message only. */
  name?: string | null
}

/** Per-route fact: routes.duration_days. Null = not recorded. */
export interface QuoteConfigRouteLookup {
  durationDays: number | null
  /** Route name, for the unresolved message only. */
  name?: string | null
}

/** Per-rate-type rule: rate_types.audience. Null defaults to international. */
export interface QuoteConfigRateTypeLookup {
  audience: RateAudience | null
}

/** The quote's own saved overrides (quotes.journey_class / rate_audience /
 * show_train_only_note). Null on any field means "follow Auto" for that axis. */
export interface QuoteConfigOverrides {
  journeyClass: JourneyClass | null
  rateAudience: RateAudience | null
  showTrainOnlyNote: boolean | null
}

export interface QuoteConfigInput {
  lineItems: readonly QuoteConfigLineItem[]
  /** Keyed by supplier id. Only suppliers actually present on the quote need an entry. */
  suppliers: Readonly<Record<string, QuoteConfigSupplierLookup>>
  /** Keyed by route id. */
  routes: Readonly<Record<string, QuoteConfigRouteLookup>>
  /** Keyed by rate type id. */
  rateTypes: Readonly<Record<string, QuoteConfigRateTypeLookup>>
  overrides: QuoteConfigOverrides
  /** bookings.primary_supplier_id -- wins the primary-supplier resolution outright when that
   * supplier is actually priced on this quote. Null on bookings predating the column, or when the
   * caller has no booking context (e.g. the Templates preview). */
  bookingPrimarySupplierId?: string | null
}

export interface QuoteConfig {
  /** The train (or other primary) supplier the journey/rate axes resolve against. */
  primarySupplierId: string | null
  /** Where primarySupplierId came from -- lets a caller explain an ambiguous pick rather than
   * silently guessing. See resolvePrimarySupplier. */
  primarySupplierSource: PrimarySupplierSource
  /** Every distinct standalone-capable supplier actually priced on the quote. Length > 1 means the
   * primary was ambiguous (e.g. a Rovos + Kruger Shalati combined booking). */
  primaryCandidateIds: string[]
  primaryRouteId: string | null
  /** The rate type priced on the primary train leg, if any -- lets a caller resolve the
   * client-facing {{rateLabel}} token (rate_types.client_label) without re-deriving it. */
  primaryTrainRateTypeId: string | null
  journeyClass: JourneyClass | null
  rateAudience: RateAudience
  trainOnly: boolean
  /** True on an axis when its value came from detection rather than a saved override. */
  auto: { journeyClass: boolean; rateAudience: boolean; trainOnly: boolean }
  /** Non-empty means the quote is missing data needed to resolve an axis that has a
   * concept to resolve (e.g. a Rovos route with no duration_days). Callers gate PDF
   * and Send on this being empty. */
  unresolved: string[]
}

function snapshotsOf(lineItems: readonly QuoteConfigLineItem[]): PricingSnapshot[] {
  return lineItems
    .map((li) => li.pricingSnapshot)
    .filter((snapshot): snapshot is PricingSnapshot => Boolean(snapshot))
}

/** Every distinct, non-service supplier kind priced on the quote. The Commission
 * line (passengerKind "service", supplierKind null) never counts as a leg. */
function pricedSupplierKinds(snapshots: readonly PricingSnapshot[]): Set<SupplierKind> {
  const kinds = new Set<SupplierKind>()
  for (const snapshot of snapshots) {
    if (snapshot.passengerKind === "service" || !snapshot.supplierKind) continue
    kinds.add(snapshot.supplierKind)
  }
  return kinds
}

export function resolveQuoteConfig(input: QuoteConfigInput): QuoteConfig {
  const { lineItems, suppliers, routes, rateTypes, overrides, bookingPrimarySupplierId } = input
  const unresolved: string[] = []

  const snapshots = snapshotsOf(lineItems)
  const mutableLineItems = [...lineItems]
  const standaloneSupplierIds = new Set(
    Object.entries(suppliers)
      .filter(([, info]) => info.sellsStandalone)
      .map(([id]) => id),
  )
  const primary = resolvePrimarySupplier(mutableLineItems, {
    bookingPrimarySupplierId: bookingPrimarySupplierId ?? null,
    standaloneSupplierIds,
  })
  const primarySupplierId = primary.supplierId
  const primaryRouteId = resolvePrimaryRoute(mutableLineItems, { primarySupplierId }).routeId

  if (primary.candidateIds.length > 1 && primary.source !== "booking") {
    const names = primary.candidateIds.map((id) => suppliers[id]?.name ?? id)
    unresolved.push(
      `Two standalone products are priced on this quote (${names.join(", ")}) -- using ${names[0]}. ` +
        "Set the booking's primary supplier to change this.",
    )
  }

  // Train-only: every priced, non-service leg is a train_operator leg.
  const kinds = pricedSupplierKinds(snapshots)
  const derivedTrainOnly = kinds.size === 1 && kinds.has("train_operator")
  const trainOnlyAuto = overrides.showTrainOnlyNote == null
  const trainOnly = overrides.showTrainOnlyNote ?? derivedTrainOnly

  // Journey class: only meaningful when the primary supplier has a threshold set.
  let derivedJourneyClass: JourneyClass | null = null
  const supplierInfo = primarySupplierId ? suppliers[primarySupplierId] : undefined
  if (supplierInfo?.longJourneyMinDays != null) {
    const routeInfo = primaryRouteId ? routes[primaryRouteId] : undefined
    if (routeInfo?.durationDays != null) {
      derivedJourneyClass = routeInfo.durationDays >= supplierInfo.longJourneyMinDays ? "long" : "short"
    } else {
      unresolved.push(
        routeInfo?.name
          ? `Journey length not recorded on ${routeInfo.name}.`
          : "Journey length not recorded on the quoted route.",
      )
    }
  }
  const journeyClassAuto = overrides.journeyClass == null
  const journeyClass = overrides.journeyClass ?? derivedJourneyClass

  // Rate audience: the primary leg's rate type, defaulting to international. Read off whatever
  // kind the primary supplier is -- a standalone stay (Kruger Shalati) has no train leg at all,
  // and pinning this to train_operator silently ignored its rate type and priced every such quote
  // as international.
  const primaryLegSnapshot = snapshots.find((snapshot) => snapshot.supplierId === primarySupplierId)
  const rateTypeId = primaryLegSnapshot?.rateTypeId ?? null
  const derivedRateAudience: RateAudience =
    (rateTypeId ? rateTypes[rateTypeId]?.audience : null) ?? DEFAULT_RATE_AUDIENCE
  const rateAudienceAuto = overrides.rateAudience == null
  const rateAudience = overrides.rateAudience ?? derivedRateAudience

  return {
    primarySupplierId,
    primarySupplierSource: primary.source,
    primaryCandidateIds: primary.candidateIds,
    primaryRouteId,
    primaryTrainRateTypeId: rateTypeId,
    journeyClass,
    rateAudience,
    trainOnly,
    auto: { journeyClass: journeyClassAuto, rateAudience: rateAudienceAuto, trainOnly: trainOnlyAuto },
    unresolved,
  }
}
