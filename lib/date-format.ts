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

const LONG_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export function formatDisplayDateLong(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  return `${parsed.getDate()} ${LONG_MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
}

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

export function formatDisplayDateShort(value: string | Date | null | undefined): string {
  const parsed = parseDateInput(value)
  if (!parsed) return ""

  return `${parsed.getDate()} ${SHORT_MONTH_NAMES[parsed.getMonth()]} ${parsed.getFullYear()}`
}
