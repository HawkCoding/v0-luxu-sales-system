interface ExistingQuoteNumber {
  quote_number: string | null
}

function getQuoteVersion(quoteNumber: string | null): number {
  const match = quoteNumber?.match(/-Q(\d+)$/)
  return match ? Number(match[1]) : 0
}

export function buildQuoteNumber(bookingNumber: string, existingQuotes: ExistingQuoteNumber[]): string {
  const highestVersion = existingQuotes.reduce(
    (highest, quote) => Math.max(highest, getQuoteVersion(quote.quote_number)),
    0,
  )

  return `${bookingNumber}-Q${highestVersion + 1}`
}

/**
 * Next revision number. Versions are counted from the highest one already on the booking, not
 * just the parent's -- revising an older quote (Q1 after Q2 exists) would otherwise reuse Q2.
 */
export function reviseQuoteNumber(
  quoteNumber: string | null,
  bookingNumber: string,
  existingQuotes: ExistingQuoteNumber[] = [],
): string {
  const base = quoteNumber ? quoteNumber.replace(/-Q\d+$/, "") : bookingNumber
  const highestVersion = existingQuotes.reduce(
    (highest, quote) => Math.max(highest, getQuoteVersion(quote.quote_number)),
    getQuoteVersion(quoteNumber),
  )

  return `${base}-Q${Math.max(highestVersion, 1) + 1}`
}

/** Postgres unique_violation on the quote number index. */
export function isQuoteNumberConflict(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" && (error.message ?? "").includes("quote_number")
}

export const QUOTE_NUMBER_CONFLICT_MESSAGE =
  "Another quote on this booking was just created, so this one got the same number. Refresh the page and try again."

/** Customer-facing label — "Quote 1" instead of the internal booking reference. */
export function formatQuoteDisplayLabel(quoteNumber: string | null | undefined): string {
  const version = getQuoteVersion(quoteNumber ?? null)
  return `Quote ${version || 1}`
}
