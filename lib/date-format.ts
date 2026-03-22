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

  const day = parsed.getDate()
  const month = parsed.getMonth() + 1
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

export function formatDisplayDateOrNull(value: string | Date | null | undefined): string | null {
  const formatted = formatDisplayDate(value)
  return formatted || null
}

export function formatDisplayDateTimeOrNull(value: string | Date | null | undefined): string | null {
  const formatted = formatDisplayDateTime(value)
  return formatted || null
}
