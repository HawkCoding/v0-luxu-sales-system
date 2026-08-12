export interface RateCardWindow {
  routeId: string
  suiteTypeId: string
  rateTypeId: string
  validFrom: string
  validTo: string | null
}

/** Open-ended ("ongoing") cards store NULL; unsaved client drafts can still carry "". */
export function isOngoingRateCard(validTo: string | null | undefined): boolean {
  return !validTo || validTo.trim() === ""
}

/** Both bounds are inclusive, matching the `[]` daterange in the no_overlapping_rate_cards
 * constraint. Dates are ISO `YYYY-MM-DD`, so lexicographic comparison is chronological. */
export function isRateCardValidOn(card: Pick<RateCardWindow, "validFrom" | "validTo">, pricingDate: string): boolean {
  if (card.validFrom > pricingDate) return false
  return isOngoingRateCard(card.validTo) || (card.validTo ?? "") >= pricingDate
}

export function findRateCardCandidates<T extends RateCardWindow>(
  cards: readonly T[],
  routeId: string,
  suiteTypeId: string,
  pricingDate: string,
): T[] {
  return cards.filter(
    (card) =>
      card.routeId === routeId &&
      card.suiteTypeId === suiteTypeId &&
      isRateCardValidOn(card, pricingDate),
  )
}

/** Ignores dates, so callers can tell "this combination was never priced" from "the card expired". */
export function hasAnyRateCardFor(
  cards: readonly Pick<RateCardWindow, "routeId" | "suiteTypeId">[],
  routeId: string,
  suiteTypeId: string,
): boolean {
  return cards.some((card) => card.routeId === routeId && card.suiteTypeId === suiteTypeId)
}

/** Ignores dates, scoped to one rate type: separates "this rate expired here" from "this rate was
 * never priced here", which are different things to tell the user to go fix. */
export function hasAnyRateCardForRateType(
  cards: readonly Pick<RateCardWindow, "routeId" | "suiteTypeId" | "rateTypeId">[],
  routeId: string,
  suiteTypeId: string,
  rateTypeId: string,
): boolean {
  return cards.some(
    (card) =>
      card.routeId === routeId && card.suiteTypeId === suiteTypeId && card.rateTypeId === rateTypeId,
  )
}

/** `inherited` marks a card resolved off a default rather than an explicit choice — the caller
 * stamps it onto the quote line so a fallback stays visible after the dialog closes. */
export type RateCardSelection<T> =
  | { ok: true; card: T; inherited: boolean }
  | { ok: false; requestedRateTypeId: string }

/**
 * Resolve deterministically. An explicit per-leg rate type is a contract: it prices at its own card
 * or not at all. Anything else walks the inherited chain: the supplier's quoted rate, then its base
 * rate, then the system default.
 *
 * The two supplier tiers are separate on purpose. `supplierQuoteRateTypeId` is what the supplier is
 * quoted at; `supplierBaseRateTypeId` is the baseline its rate markdowns are measured off. A quoted
 * rate with no card for this route/suite falls through to the base rate rather than failing — it was
 * inherited, not asked for.
 *
 * Returning `{ ok: false }` rather than another rate type's card is deliberate for the explicit
 * case. Substituting used to be silent, so picking a rate whose card had expired quoted the default
 * rate's price as though it were the chosen one — the caller turns this into an error naming the
 * rate type.
 */
export function selectRateCard<T extends RateCardWindow>(
  candidates: readonly T[],
  preferredRateTypeId?: string | null,
  supplierQuoteRateTypeId?: string | null,
  supplierBaseRateTypeId?: string | null,
  systemDefaultRateTypeId?: string | null,
): RateCardSelection<T> | undefined {
  if (candidates.length === 0) return undefined

  const byRateType = (rateTypeId: string | null | undefined) =>
    rateTypeId ? candidates.find((card) => card.rateTypeId === rateTypeId) : undefined

  // The leg's own dropdown value — never falls through to another rate type.
  if (preferredRateTypeId) {
    const card = byRateType(preferredRateTypeId)
    return card ? { ok: true, card, inherited: false } : { ok: false, requestedRateTypeId: preferredRateTypeId }
  }

  for (const inheritedRateTypeId of [
    supplierQuoteRateTypeId,
    supplierBaseRateTypeId,
    systemDefaultRateTypeId,
  ]) {
    const card = byRateType(inheritedRateTypeId)
    if (card) return { ok: true, card, inherited: true }
  }

  // Every tier was set but none had a card: report the most specific one so the error names the
  // rate type the user is most likely to recognise.
  const mostSpecificRequested =
    supplierQuoteRateTypeId ?? supplierBaseRateTypeId ?? systemDefaultRateTypeId
  if (mostSpecificRequested) return { ok: false, requestedRateTypeId: mostSpecificRequested }

  // No rate type is knowable at all (no supplier or system default configured), so there is
  // nothing to honour or contradict — any valid card is as correct as another.
  return { ok: true, card: candidates[0], inherited: true }
}
