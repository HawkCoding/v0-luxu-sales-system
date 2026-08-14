const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Every displayed date and time is rendered in South African time, not in the timezone of whatever
 * machine happens to be formatting it. These helpers run both server-side (API routes, which run in
 * UTC on Vercel) and client-side (browser, which is whatever the user's laptop says), so reading the
 * local clock used to make the same timestamp print two different times depending on where it was
 * formatted.
 */
export const APP_TIME_ZONE = "Africa/Johannesburg"

interface DateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * A date-only value ("2026-07-04") is a calendar date, not an instant — a departure date is the 4th
 * of July everywhere, so it is never zone-converted. Anything else is a real point in time and is
 * read in `APP_TIME_ZONE`.
 */
type ParsedDate =
  | { kind: "date-only"; parts: DateParts }
  | { kind: "instant"; date: Date }

const ZONED_FORMATTER = new Intl.DateTimeFormat("en-ZA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function zonedParts(date: Date): DateParts {
  const parts = ZONED_FORMATTER.formatToParts(date)
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0")

  // Some ICU versions render midnight as hour "24" under hour12: false.
  const hour = read("hour")

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: hour === 24 ? 0 : hour,
    minute: read("minute"),
  }
}

function parseDateInput(value: string | Date | null | undefined): ParsedDate | null {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { kind: "instant", date: value }
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    if (!isRealDate(Number(year), Number(month), Number(day))) return null
    return {
      kind: "date-only",
      parts: { year: Number(year), month: Number(month), day: Number(day), hour: 0, minute: 0 },
    }
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : { kind: "instant", date: parsed }
}

function displayParts(value: string | Date | null | undefined): DateParts | null {
  const parsed = parseDateInput(value)
  if (!parsed) return null

  return parsed.kind === "date-only" ? parsed.parts : zonedParts(parsed.date)
}

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

/** Zero-padded day of month ("07", "18") — the house style for all client-facing dates. */
export function formatDayOfMonth(value: string | Date | null | undefined): string {
  const parts = displayParts(value)
  if (!parts) return ""

  return pad(parts.day)
}

export function formatDisplayDate(value: string | Date | null | undefined): string {
  const parts = displayParts(value)
  if (!parts) return ""

  return `${pad(parts.day)}-${pad(parts.month)}-${parts.year}`
}

export function formatDisplayDateTime(value: string | Date | null | undefined): string {
  const parts = displayParts(value)
  if (!parts) return ""

  return `${pad(parts.day)}-${pad(parts.month)}-${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}`
}

/** "HH:MM" in `APP_TIME_ZONE`, or null when `value` doesn't parse — for callers (e.g. voucher/
 * quote block builders) that need just the clock time and run server-side, where the naive
 * `new Date(value).getHours()` reads the process's UTC clock instead of South African time. */
export function formatTimeHHMM(value: string | Date | null | undefined): string | null {
  const parts = displayParts(value)
  if (!parts) return null

  return `${pad(parts.hour)}:${pad(parts.minute)}`
}

/** "YYYY-MM-DD" in `APP_TIME_ZONE`, or null when `value` doesn't parse — the ISO counterpart to
 * `formatTimeHHMM` for callers that need the zone-correct calendar date of an instant. */
export function formatDateISO(value: string | Date | null | undefined): string | null {
  const parts = displayParts(value)
  if (!parts) return null

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export const LONG_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function formatDisplayDateLong(value: string | Date | null | undefined): string {
  const parts = displayParts(value)
  if (!parts) return ""

  return `${pad(parts.day)} ${LONG_MONTH_NAMES[parts.month - 1]} ${parts.year}`
}

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export function formatDisplayDateShort(value: string | Date | null | undefined): string {
  const parts = displayParts(value)
  if (!parts) return ""

  return `${pad(parts.day)} ${SHORT_MONTH_NAMES[parts.month - 1]} ${parts.year}`
}

const DMY_NUMERIC_PATTERN = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/
const DMY_NAMED_MONTH_PATTERN = /^(\d{1,2})[\s\-/]+([A-Za-z]{3,})[\s\-/]+(\d{4})$/

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const probe = new Date(year, month - 1, day)
  return (
    probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day
  )
}

/**
 * Normalises a hand-typed date of birth to `YYYY-MM-DD`, or returns null if it
 * can't be read confidently.
 *
 * `travellers.date_of_birth` is free text (webhook intake can send anything)
 * while `customers.date_of_birth` is a real DATE column, so a value only makes
 * it onto the customer profile — and therefore only prefills the next booking —
 * once it is ISO. Salespeople type South African style, so a bare numeric date
 * is always read as DAY/MONTH/YEAR: "12-05-1980" is 12 May 1980, never 5 Dec.
 * Both separators are accepted, so a value copied back out of the UI (which
 * prints `DD-MM-YYYY`) round-trips. Ambiguity is not guessed away — anything
 * that isn't one of the accepted shapes, or that isn't a real calendar date,
 * returns null and is left as the user typed it.
 */
export function normalizeDateOfBirth(value: string | null | undefined): string | null {
  const input = value?.trim()
  if (!input) return null

  const iso = DATE_ONLY_PATTERN.exec(input)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null
  }

  const numeric = DMY_NUMERIC_PATTERN.exec(input)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    const year = Number(numeric[3])
    return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null
  }

  const named = DMY_NAMED_MONTH_PATTERN.exec(input)
  if (named) {
    const day = Number(named[1])
    const monthToken = named[2].toLowerCase()
    const monthIndex = SHORT_MONTH_NAMES.findIndex(
      (name, index) =>
        monthToken === name.toLowerCase() || monthToken === LONG_MONTH_NAMES[index].toLowerCase(),
    )
    if (monthIndex === -1) return null
    const year = Number(named[3])
    return isRealDate(year, monthIndex + 1, day) ? `${year}-${pad(monthIndex + 1)}-${pad(day)}` : null
  }

  return null
}
