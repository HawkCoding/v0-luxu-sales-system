export interface CurrentQuoteCandidate {
  status: string
  createdAt?: string | null
}

// Checked in order; the first status with any quote wins.
const PREFERRED_STATUSES = ["accepted", "sent", "expired"] as const
const NEVER_CURRENT = new Set(["superseded", "cancelled"])

function createdTime(quote: CurrentQuoteCandidate): number {
  const time = quote.createdAt ? Date.parse(quote.createdAt) : Number.NaN
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

function newest<T extends CurrentQuoteCandidate>(quotes: readonly T[]): T | null {
  return quotes.reduce<T | null>(
    (best, quote) => (best === null || createdTime(quote) > createdTime(best) ? quote : best),
    null,
  )
}

/**
 * The one quote a list row stands for. A booking can carry several (revisions, alternatives), and
 * summing them used to inflate the row total. Prefers the accepted quote, then the newest sent,
 * then the newest expired, then the newest draft-like one. Superseded and cancelled quotes never
 * count. Returns null when nothing qualifies.
 */
export function pickCurrentQuote<T extends CurrentQuoteCandidate>(quotes: readonly T[]): T | null {
  for (const status of PREFERRED_STATUSES) {
    const match = newest(quotes.filter((quote) => quote.status === status))
    if (match) return match
  }
  return newest(quotes.filter((quote) => !NEVER_CURRENT.has(quote.status)))
}
