import { formatDateISO } from "@/lib/date-format"

/**
 * Case-insensitive "does any field contain this search term" check, shared by every list page's
 * search box (customers, bookings, documents, payments). An empty query always matches.
 */
export function matchesSearch(fields: (string | null | undefined)[], query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return fields.some((field) => field?.toLowerCase().includes(normalized))
}

/**
 * Date-range predicate for list filter bars. `value` is compared in `APP_TIME_ZONE` (via
 * `formatDateISO`) against the `from`/`to` ISO bounds, both inclusive.
 *
 * `to` is inclusive of the whole day it names — a row created at 14:00 on the "to" date must
 * still match. Comparing ISO date strings (rather than converting to end-of-day instants) gets
 * this for free and sidesteps DST/timezone edge cases entirely.
 */
export function isWithinDateRange(
  value: string | Date | null | undefined,
  from?: string | null,
  to?: string | null,
): boolean {
  if (!from && !to) return true

  const valueIso = formatDateISO(value)
  if (!valueIso) return false

  if (from && valueIso < from) return false
  if (to && valueIso > to) return false
  return true
}
