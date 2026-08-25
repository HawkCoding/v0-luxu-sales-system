import type { QuoteLineItem } from "@/lib/types"

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateQuoteTotals(lineItems: QuoteLineItem[]) {
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0))

  return { subtotal, total: subtotal }
}

export function isPricingEngineLineItem(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.source === "pricing_engine"
}

/**
 * A line that is zero-priced because it is an inclusion of a fixed-price
 * package — the price sits on that package's "Package Total" line, not here.
 * Distinct from a line that is zero because nobody has priced it yet.
 */
export function isFixedPackageInclusion(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.pricingMode === "fixed_package"
}

/**
 * True when a hotel room's price was deliberately typed as R0 (the supplier comped the whole
 * stay) rather than left unpriced. `manualRoomPrice` only exists on hotel legs, so this can't
 * misfire on other supplier kinds. See the price override in suite-leg-editor.tsx.
 */
export function isComplimentaryRoom(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.manualRoomPrice === 0
}

/**
 * True when a tour unit's price was deliberately typed as R0 (a comped tour) rather than left
 * unpriced. `manualTourPrice` only exists on tour legs, so this can't misfire on other supplier
 * kinds. See the price override in suite-leg-editor.tsx.
 */
export function isComplimentaryTour(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.manualTourPrice === 0
}

/**
 * True when a transfer/rental trip was deliberately marked complimentary — a dedicated flag,
 * independent of `manualTransportPrice`, so a comped trip is distinguishable from one that was
 * simply typed as R0. See the toggle in transport-leg-editor.tsx.
 */
export function isComplimentaryTransport(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.isComplimentaryTransport === true
}

/**
 * Nights of a hotel room's stay the supplier gifted. Today the "Mark first night complimentary"
 * action in suite-leg-editor.tsx only ever gifts one, but the count is what the line's qty was
 * derived from, so it is read back as a number rather than a flag.
 */
export function complimentaryNights(lineItem: QuoteLineItem): number {
  const nights = lineItem.pricingSnapshot?.complimentaryNights
  return typeof nights === "number" && nights > 0 ? nights : 0
}

/** The room's full stay length, which is longer than the line's qty once a night is gifted. */
export function stayNights(lineItem: QuoteLineItem): number {
  const nights = lineItem.pricingSnapshot?.stayNights
  return typeof nights === "number" && nights > 0 ? nights : lineItem.qty
}

/** True when a hotel room had one or more nights gifted but is still charged for the rest. */
export function hasComplimentaryNight(lineItem: QuoteLineItem): boolean {
  return complimentaryNights(lineItem) > 0
}

/**
 * True when a rate card carried no infant price, so the infant travels free. The pricing engine
 * resolves that to R0 rather than the child fare (see build-from-package.ts), and a free infant is
 * a finished line — not one waiting on a number.
 */
export function isFreeInfant(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.passengerKind === "infant"
}

/**
 * True when the Commission line was deliberately set to 0 rather than left unconfigured — a
 * breakdown only exists once a type was chosen in Build Booking (see buildCommissionBreakdown),
 * so its presence distinguishes "commission of 0" from "no commission set yet".
 */
export function isDeliberateZeroCommission(lineItem: QuoteLineItem): boolean {
  return lineItem.pricingSnapshot?.commission?.type != null
}

/** True when a line is zero-priced for a reason the quote still needs resolved. */
export function isMissingPricing(lineItem: QuoteLineItem): boolean {
  return (
    lineItem.unitPrice === 0 &&
    !isFixedPackageInclusion(lineItem) &&
    !isComplimentaryRoom(lineItem) &&
    !isComplimentaryTour(lineItem) &&
    // A one-night stay with its only night gifted charges nothing and prices nothing — that is a
    // finished line, not an unpriced one.
    !hasComplimentaryNight(lineItem) &&
    !isComplimentaryTransport(lineItem) &&
    !isFreeInfant(lineItem) &&
    !isDeliberateZeroCommission(lineItem)
  )
}
