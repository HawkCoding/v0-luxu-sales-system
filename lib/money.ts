import { CURRENCIES, type SupportedCurrency } from "@/lib/types"

/** The system's base currency. Supplier rates in anything else are converted into the
 *  quote's currency at build time; see `lib/pricing/convert-currency.ts`. */
export const BASE_CURRENCY: SupportedCurrency = "ZAR"

const SUPPORTED_CURRENCY_CODES = new Set<string>(CURRENCIES.map((entry) => entry.value))

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return SUPPORTED_CURRENCY_CODES.has(value)
}

/** Normalises free-text currency input (legacy rate cards accepted any string) to a supported
 *  code, falling back to the base currency rather than throwing — a bad code must never stop a
 *  quote from rendering. */
export function normaliseCurrency(value: string | null | undefined): SupportedCurrency {
  const code = (value ?? "").trim().toUpperCase()
  return isSupportedCurrency(code) ? code : BASE_CURRENCY
}

/**
 * The single money formatter for the whole app — screens, PDFs and email tokens all go through
 * here so a currency change lands everywhere at once.
 *
 * Emits the symbol itself (`R 1 234,50`, `$1 234,50`), so callers must never prefix their own.
 * Two migrations exist purely to strip a literal "R" that was typed in front of a token which
 * already carried one; see `20260810120000_fix_double_rand_templates_all_rows.sql`.
 */
export function formatMoney(amount: number, currency: string = BASE_CURRENCY): string {
  const code = (currency ?? "").trim().toUpperCase() || BASE_CURRENCY
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    // An unknown ISO code makes Intl throw. Degrade to a readable "USD 1234.50" rather than
    // losing the number entirely.
    return `${code} ${amount.toFixed(2)}`
  }
}

/** Just the symbol, for input adornments and field labels ("Amount (R)"). */
export function currencySymbol(currency: string = BASE_CURRENCY): string {
  const code = (currency ?? "").trim().toUpperCase() || BASE_CURRENCY
  try {
    const parts = new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0)
    return parts.find((part) => part.type === "currency")?.value ?? code
  } catch {
    return code
  }
}

/**
 * An exchange rate as shown to (and edited by) a salesperson — 4 decimal places, so a 5c nudge
 * on a USD→ZAR rate is expressible. Deliberately not `formatMoney`: a rate is a multiplier, not
 * an amount, and must never carry a currency symbol.
 */
export function formatFxRate(rate: number): string {
  return rate.toLocaleString("en-ZA", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}
