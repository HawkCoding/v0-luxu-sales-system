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

export function reviseQuoteNumber(quoteNumber: string | null, bookingNumber: string): string {
  if (!quoteNumber) return `${bookingNumber}-Q2`

  const version = getQuoteVersion(quoteNumber)
  if (version === 0) return `${quoteNumber}-Q2`

  return quoteNumber.replace(/-Q\d+$/, `-Q${version + 1}`)
}
