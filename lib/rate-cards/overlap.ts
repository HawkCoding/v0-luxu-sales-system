export interface RateCardDateRange {
  validFrom: string
  validTo: string | null
}

export interface RateCardGroupKey {
  rateTypeId: string
  routeId: string
  suiteTypeId: string
}

export function areRateCardDateRangesOverlapping(
  first: RateCardDateRange,
  second: RateCardDateRange,
): boolean {
  const firstStartsBeforeSecondEnds = !second.validTo || first.validFrom <= second.validTo
  const secondStartsBeforeFirstEnds = !first.validTo || second.validFrom <= first.validTo
  return firstStartsBeforeSecondEnds && secondStartsBeforeFirstEnds
}

export function checkRateCardOverlaps(
  rateCards: Array<RateCardGroupKey & RateCardDateRange>,
): void {
  const groupedRateCards = new Map<string, Array<RateCardGroupKey & RateCardDateRange>>()

  for (const rateCard of rateCards) {
    const groupKey = [rateCard.rateTypeId, rateCard.routeId, rateCard.suiteTypeId].join("|")
    const nextGroup = groupedRateCards.get(groupKey) ?? []
    nextGroup.push(rateCard)
    groupedRateCards.set(groupKey, nextGroup)
  }

  for (const groupedCardSet of groupedRateCards.values()) {
    const sortedRateCards = [...groupedCardSet].sort((a, b) =>
      a.validFrom.localeCompare(b.validFrom),
    )

    for (let index = 0; index < sortedRateCards.length; index += 1) {
      const firstCard = sortedRateCards[index]
      for (let compareIndex = index + 1; compareIndex < sortedRateCards.length; compareIndex += 1) {
        const secondCard = sortedRateCards[compareIndex]
        if (areRateCardDateRangesOverlapping(firstCard, secondCard)) {
          throw new Error(
            "Overlapping rate card periods are not allowed for the same route and suite type.",
          )
        }
      }
    }
  }
}
