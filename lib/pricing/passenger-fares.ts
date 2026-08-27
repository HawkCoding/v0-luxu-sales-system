import type { PricingSnapshot } from "@/lib/types"

/** One priced line for a single passenger kind — the shape every caller loops over to emit one
 * addLineItem() (or price-extra-line addLine()) call per kind. */
export interface PassengerFare {
  key: "adultCount" | "childCount" | "infantCount"
  label: "Adult" | "Child" | "Infant"
  kind: PricingSnapshot["passengerKind"]
  unitPrice: number
}

/** Minimal rate-card shape this module needs — just the three fare columns, camelCased. Callers
 * holding the raw snake_case DB row (price_per_person / child_price / infant_price) map it in. */
export interface FareRateCard {
  pricePerPerson: number
  childPrice: number | null
  infantPrice: number | null
}

const FARE_KEYS = [
  { key: "adultCount", label: "Adult", kind: "adult" },
  { key: "childCount", label: "Child", kind: "child" },
  { key: "infantCount", label: "Infant", kind: "infant" },
] as const satisfies readonly { key: PassengerFare["key"]; label: PassengerFare["label"]; kind: PassengerFare["kind"] }[]

/**
 * Fares straight off a rate card: adult pays the card's own price, child falls back to the adult
 * price when the card sets no child price, and infant falls back to **zero**, not to the child
 * price. That asymmetry is deliberate — a card with no infant rate means infants travel free. The
 * fallback used to be the child rate, which made "the supplier set no infant price" and "the
 * supplier charges the child price for infants" look identical on the quote, with the expensive
 * reading winning by default. Zero is the reading a consultant can actually spot. See also
 * manualFares below, where the fallback chain is intentionally the opposite.
 */
export function rateCardFares(card: FareRateCard): PassengerFare[] {
  const adultPrice = card.pricePerPerson
  const childPrice = card.childPrice ?? adultPrice
  const infantPrice = card.infantPrice ?? 0
  return [
    { ...FARE_KEYS[0], unitPrice: adultPrice },
    { ...FARE_KEYS[1], unitPrice: childPrice },
    { ...FARE_KEYS[2], unitPrice: infantPrice },
  ]
}

/**
 * Fares for a manual (typed, no rate card) supplier. Here the fallback chain runs the other way —
 * child defaults to the adult price, and infant defaults to the child price — because a manual
 * fare with nothing typed for child/infant is read as "same as the one price the consultant did
 * type", not as "free". There is no rate card to fall back to zero from.
 */
export function manualFares(prices: {
  adult: number | null
  child: number | null
  infant: number | null
}): PassengerFare[] {
  const adultPrice = prices.adult ?? 0
  const childPrice = prices.child ?? adultPrice
  const infantPrice = prices.infant ?? childPrice
  return [
    { ...FARE_KEYS[0], unitPrice: adultPrice },
    { ...FARE_KEYS[1], unitPrice: childPrice },
    { ...FARE_KEYS[2], unitPrice: infantPrice },
  ]
}

/**
 * Fares for an overridden line: each kind takes its own typed override when set, otherwise falls
 * back to that kind's rate-card fare (card may be absent entirely — an override needs no rate
 * card, the same non-fatal posture as a hotel room override or a complimentary trip). Child falls
 * back through the *resolved* adult price (override or card), matching rateCardFares' chain;
 * infant falls back to the card's own infant rate, or zero — never to child.
 */
export function overriddenFares(
  card: FareRateCard | null,
  overrides: { adult: number | null; child: number | null; infant: number | null },
): PassengerFare[] {
  const adultPrice = overrides.adult ?? card?.pricePerPerson ?? 0
  const childPrice = overrides.child ?? card?.childPrice ?? adultPrice
  const infantPrice = overrides.infant ?? card?.infantPrice ?? 0
  return [
    { ...FARE_KEYS[0], unitPrice: adultPrice },
    { ...FARE_KEYS[1], unitPrice: childPrice },
    { ...FARE_KEYS[2], unitPrice: infantPrice },
  ]
}
