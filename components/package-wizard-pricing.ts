import type { EditableSupplierRateCard } from "@/components/package-leg-editor"
import type { SelectablePackageLeg } from "@/components/package-leg-selector"

export interface CurrencyRange {
  currency: string
  min: number
  max: number
}

export function getSelectedRateCards(
  leg: SelectablePackageLeg,
): EditableSupplierRateCard[] {
  const selectedRouteIds = new Set(leg.selectedRouteIds)
  return leg.rateCards.filter((rateCard) => selectedRouteIds.has(rateCard.routeId))
}

export function formatMoneyAmount(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function formatMoney(currency: string, value: number): string {
  return `${currency} ${formatMoneyAmount(value)}`
}

export function formatRange(range: CurrencyRange): string {
  if (range.min === range.max) {
    return formatMoney(range.currency, range.min)
  }

  return `${formatMoney(range.currency, range.min)} - ${formatMoney(range.currency, range.max)}`
}

export function getCurrencyRanges(
  rateCards: EditableSupplierRateCard[],
  fallbackCurrency: string,
): CurrencyRange[] {
  const pricesByCurrency = new Map<string, number[]>()
  rateCards.forEach((rateCard) => {
    const currency = rateCard.currency.trim().toUpperCase() || fallbackCurrency
    pricesByCurrency.set(currency, [
      ...(pricesByCurrency.get(currency) ?? []),
      rateCard.pricePerPerson,
    ])
  })

  return Array.from(pricesByCurrency.entries())
    .map(([currency, prices]) => ({
      currency,
      min: Math.min(...prices),
      max: Math.max(...prices),
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency))
}

export function getPackageCurrencyRanges(
  legs: SelectablePackageLeg[],
  fallbackCurrency: string,
): CurrencyRange[] {
  const currencies = new Set<string>()
  legs.forEach((leg) => {
    getSelectedRateCards(leg).forEach((rateCard) => {
      currencies.add(rateCard.currency.trim().toUpperCase() || fallbackCurrency)
    })
  })

  return Array.from(currencies)
    .map((currency) => {
      const legRanges = legs
        .map((leg) =>
          getCurrencyRanges(
            getSelectedRateCards(leg).filter(
              (rateCard) => (rateCard.currency.trim().toUpperCase() || fallbackCurrency) === currency,
            ),
            fallbackCurrency,
          )[0],
        )
        .filter((range): range is CurrencyRange => Boolean(range))

      return {
        currency,
        min: legRanges.reduce((total, range) => total + range.min, 0),
        max: legRanges.reduce((total, range) => total + range.max, 0),
      }
    })
    .sort((left, right) => left.currency.localeCompare(right.currency))
}
