// Pure helpers backing <DateTimePicker>. Values are stored as full UTC ISO
// timestamps but edited as a local date (yyyy-mm-dd) plus a 24-hour time (HH:MM),
// so the split/join always round-trips through the browser's local timezone.

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

export interface LocalDateTimeParts {
  /** Local calendar date as yyyy-mm-dd, or "" when unset/unparseable. */
  date: string
  /** Local 24-hour time as HH:MM, or "" when unset/unparseable. */
  time: string
}

export function splitLocalDateTime(value: string | null | undefined): LocalDateTimeParts {
  if (!value) return { date: "", time: "" }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" }

  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  }
}

/**
 * Recombines the parts into a UTC ISO timestamp. A missing date yields null —
 * a time on its own has no instant to anchor to. A missing time means midnight.
 */
export function joinLocalDateTime(date: string, time: string): string | null {
  if (!date) return null

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!dateMatch) return null

  const normalizedTime = normalizeTimeInput(time) || "00:00"
  const [hours, minutes] = normalizedTime.split(":")

  const [, year, month, day] = dateMatch
  const combined = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  )

  return Number.isNaN(combined.getTime()) ? null : combined.toISOString()
}

/**
 * Coerces loose keyboard input into 24-hour HH:MM. Accepts "930", "9:3", "0930",
 * "14:30". Returns "" when the input can't be read as a time, so a half-typed
 * value never silently becomes a wrong one. Out-of-range parts are rejected
 * rather than clamped — 25:00 is a typo, not 23:00.
 */
export function normalizeTimeInput(raw: string | null | undefined): string {
  if (!raw) return ""

  const trimmed = raw.trim()
  if (!trimmed) return ""

  const digits = trimmed.replace(/\D/g, "")
  if (digits.length === 0 || digits.length > 4) return ""

  let hours: number
  let minutes: number

  if (trimmed.includes(":")) {
    const [rawHours, rawMinutes] = trimmed.split(":")
    if (!rawHours || rawMinutes === undefined) return ""
    hours = Number(rawHours)
    minutes = rawMinutes === "" ? 0 : Number(rawMinutes)
  } else if (digits.length <= 2) {
    hours = Number(digits)
    minutes = 0
  } else {
    // "930" -> 9:30, "0930" -> 09:30
    hours = Number(digits.slice(0, digits.length - 2))
    minutes = Number(digits.slice(-2))
  }

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return ""
  if (hours < 0 || hours > 23) return ""
  if (minutes < 0 || minutes > 59) return ""

  return `${pad(hours)}:${pad(minutes)}`
}
