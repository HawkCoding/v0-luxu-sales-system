// Deliberately permissive: customers arrive from South African, UK, US and EU
// sources, so anything stricter than "could a human dial this" (E.164, region
// parsing) rejects legitimate numbers. The point is to stop free text like
// "((((not a phone))))###" reaching a client-facing voucher, not to canonicalise.

const ALLOWED_CHARACTERS = /^[+0-9\s().\-/]+$/
const MIN_DIGITS = 7
const MAX_DIGITS = 20

export const PHONE_VALIDATION_MESSAGE = "Enter a valid phone number"

export function isPlausiblePhone(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (!ALLOWED_CHARACTERS.test(trimmed)) return false

  // A leading "+" is the only place a plus sign is meaningful.
  if (trimmed.slice(1).includes("+")) return false

  const digitCount = trimmed.replace(/\D/g, "").length
  return digitCount >= MIN_DIGITS && digitCount <= MAX_DIGITS
}
