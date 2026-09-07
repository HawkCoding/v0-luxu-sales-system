// Pure helpers backing <DateTimePicker>. Values are stored as UTC instants but edited as a South
// African calendar date (yyyy-mm-dd) plus a 24-hour time (HH:MM) -- the split/join always
// round-trips through APP_TIME_ZONE, not whichever timezone the machine formatting it happens to
// be set to (F-P3-5: reading/writing the browser's local clock here shifted a pickup onto the
// wrong South African day for anyone not on a South African machine).

import { formatDateISO, formatTimeHHMM, zonedDateTimeToIso } from "@/lib/date-format"

function pad(value: number): string {
  return value.toString().padStart(2, "0")
}

export interface AppZoneDateTimeParts {
  /** Calendar date in APP_TIME_ZONE as yyyy-mm-dd, or "" when unset/unparseable. */
  date: string
  /** 24-hour time in APP_TIME_ZONE as HH:MM, or "" when unset/unparseable. */
  time: string
}

export function splitAppZoneDateTime(value: string | null | undefined): AppZoneDateTimeParts {
  return {
    date: formatDateISO(value) ?? "",
    time: formatTimeHHMM(value) ?? "",
  }
}

/**
 * Recombines the parts into the UTC instant at which the wall clock in APP_TIME_ZONE reads that
 * date and time. A missing date yields null — a time on its own has no instant to anchor to. A
 * missing time means midnight.
 */
export function joinAppZoneDateTime(date: string, time: string): string | null {
  if (!date) return null

  const normalizedTime = normalizeTimeInput(time) || "00:00"
  return zonedDateTimeToIso(date, normalizedTime)
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
