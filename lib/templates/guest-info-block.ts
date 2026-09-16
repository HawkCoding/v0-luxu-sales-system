// Builds the {{guestInfo}} block token for the deposit_request template:
// lets the customer confirm who the booking is for, and that each guest's
// DOB, country of residence and passport/ID number on file are correct,
// before final documents go out.
// DOB and passport/ID numbers are sensitive — this block only ever goes out
// at the customer's own request to verify the data, never proactively.

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

/** "DD/MM/YYYY" from a stored "YYYY-MM-DD" date-only string — a birth date is a calendar date, not
 * an instant, so this never goes through timezone conversion (see lib/date-format.ts). */
function formatDobSlashes(value: string | null): string | null {
  if (!value) return null
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

export interface GuestInfoGuest {
  /** Formatted "Prefix First Last". */
  name: string
  dateOfBirth: string | null
  /** Country code as shown to the guest, e.g. "ZA", "UK". */
  countryCode: string | null
  idNumber: string | null
}

export interface GuestInfoInput {
  customerName: string
  customerEmail: string | null
  /** Named travellers with their DOB/country/ID details. Empty when not yet captured. */
  guests: GuestInfoGuest[]
  adults: number
  children: number
}

function formatPaxCount(adults: number, children: number): string {
  const parts: string[] = []
  if (adults > 0) parts.push(`${adults} Adult${adults === 1 ? "" : "s"}`)
  if (children > 0) parts.push(`${children} Child${children === 1 ? "" : "ren"}`)
  return parts.join(", ")
}

function formatGuestLine(guest: GuestInfoGuest): string {
  const dob = formatDobSlashes(guest.dateOfBirth)
  const parts = [escapeHtml(guest.name)]
  if (dob) parts.push(`DOB: ${dob}`)
  if (guest.countryCode) parts.push(escapeHtml(guest.countryCode))
  parts.push(guest.idNumber ? escapeHtml(guest.idNumber) : "Passport/ID not yet on file")
  return parts.join(" ")
}

export function buildGuestInfoBlock(input: GuestInfoInput): string {
  const lineStyle = "margin:0 0 6px;color:#312b24;font-size:13px;line-height:19px;"
  const rowStyle = "margin:0 0 4px;color:#312b24;font-size:13px;line-height:19px;"

  const lines: string[] = []

  if (input.guests.length > 0) {
    for (const guest of input.guests) {
      lines.push(`<p style="${rowStyle}">${formatGuestLine(guest)}</p>`)
    }
  } else {
    const paxCount = formatPaxCount(input.adults, input.children)
    if (paxCount) {
      lines.push(`<p style="${lineStyle}"><strong>Guests:</strong> ${escapeHtml(paxCount)}</p>`)
    }
  }

  return lines.join("")
}
