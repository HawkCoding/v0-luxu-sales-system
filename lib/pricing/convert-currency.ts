import { roundMoney } from "@/lib/quotes/pricing-engine"
import { BASE_CURRENCY } from "@/lib/money"

/**
 * Rates expressed against the base currency: `map[code]` is how many base units one unit of
 * `code` buys. `USD: 17.25` reads "1 USD = 17.25 ZAR". The base currency itself is 1.
 */
export type FxRateMap = Record<string, number>

/** The publication date and origin of each rate, carried alongside the map so a converted line
 *  can be stamped with which day's rate it used. */
export interface FxRateMeta {
  asOf: string
  source: string
}

export class MissingFxRateError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `No exchange rate available for ${from} → ${to}. Refresh rates under the quote's currency ` +
        `converter, or enter one manually.`,
    )
    this.name = "MissingFxRateError"
  }
}

function normalise(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase() || BASE_CURRENCY
}

/** How many base units one `code` buys. Throws rather than defaulting to 1: silently treating a
 *  missing USD rate as parity is exactly the ~17x error this feature exists to prevent. */
function rateToBase(code: string, rates: FxRateMap, from: string, to: string): number {
  if (code === BASE_CURRENCY) return 1
  const rate = rates[code]
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    throw new MissingFxRateError(from, to)
  }
  return rate
}

export interface ConvertedAmount {
  amount: number
  /** The multiplier actually applied: `amount = roundMoney(input * rate)`. Stamped onto the
   *  quote line so a sent quote never reprices when the market moves. */
  rate: number
}

/**
 * Converts an amount between two currencies via the base currency.
 *
 * Same-currency conversion is an identity with `rate: 1` — callers use that to tell a converted
 * line from a native one without a second comparison.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: FxRateMap,
): ConvertedAmount {
  const fromCode = normalise(from)
  const toCode = normalise(to)

  if (fromCode === toCode) {
    return { amount: roundMoney(amount), rate: 1 }
  }

  const fromRate = rateToBase(fromCode, rates, fromCode, toCode)
  const toRate = rateToBase(toCode, rates, fromCode, toCode)
  // Round the multiplier before applying it so the rate stamped on the line reproduces the
  // stored amount exactly — a salesperson checking "6 400 x 17,2500" must get the printed total.
  const rate = roundFxRate(fromRate / toRate)

  return { amount: roundMoney(amount * rate), rate }
}

/**
 * Rates carry 6 decimals. Four would be plenty for a "1 USD = 17.2500 ZAR" style rate (which is
 * all the UI shows), but the inverse direction is around 0.058 — at 4 decimals that is only three
 * significant figures, and converting a six-figure rand total back to dollars would be off by
 * several units. Six keeps both directions accurate while still letting a hand-typed 4-decimal
 * rate round-trip unchanged.
 */
export function roundFxRate(rate: number): number {
  return Math.round(rate * 1_000_000) / 1_000_000
}

/** Applies an already-decided rate (e.g. one a salesperson edited) without re-deriving it. */
export function applyFxRate(amount: number, rate: number): number {
  return roundMoney(amount * rate)
}
