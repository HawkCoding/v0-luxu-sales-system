const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateInput(value: string | Date | null | undefined): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    const parsed = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

/** Zero-padded day of month ("07", "18") — the house style for all client-facing dates. */
export function formatDayOfMonth(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  return pad(parsed.getDate())
}

export function formatDisplayDate(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  const day = pad(parsed.getDate())
  const month = pad(parsed.getMonth() + 1)
  const year = parsed.getFullYear()

  return `${day}/${month}/${year}`
}

export function formatDisplayDateTime(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  const datePortion = formatDisplayDate(parsed)
  if (!datePortion) return ""

  return `${datePortion} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

export const LONG_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function formatDisplayDateLong(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  return `${pad(parsed.getDate())} ${LONG_MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
}

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export function formatDisplayDateShort(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  return `${pad(parsed.getDate())} ${SHORT_MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
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
 * is always read as DAY/MONTH/YEAR: "12/05/1980" is 12 May 1980, never 5 Dec.
 * Ambiguity is not guessed away — anything that isn't one of the accepted
 * shapes, or that isn't a real calendar date, returns null and is left as the
 * user typed it.
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
