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

/** Resolve deterministically: a per-leg override beats the quote-level choice, which beats the
 * system default, which beats any remaining card. */
export function selectRateCard<T extends RateCardWindow>(
  candidates: readonly T[],
  preferredRateTypeId?: string | null,
  quoteRateTypeId?: string | null,
  fallbackRateTypeId?: string | null,
): T | undefined {
  if (candidates.length === 0) return undefined

  const byRateType = (rateTypeId: string | null | undefined) =>
    rateTypeId ? candidates.find((card) => card.rateTypeId === rateTypeId) : undefined

  return (
    byRateType(preferredRateTypeId ?? quoteRateTypeId) ?? byRateType(fallbackRateTypeId) ?? candidates[0]
  )
}
