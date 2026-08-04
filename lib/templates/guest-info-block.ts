// Builds the {{guestInfo}} block token for the deposit_request template:
// lets the customer confirm who the booking is for, and that each guest's
// ID/passport number on file is correct, before final documents go out.
// ID numbers are sensitive — this block only ever goes out at the customer's
// own request to verify the data, never proactively.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export interface GuestInfoGuest {
  /** Formatted "Prefix First Last". */
  name: string
  idNumber: string | null
}

export interface GuestInfoInput {
  customerName: string
  customerEmail: string | null
  /** Named travellers with their ID/passport numbers. Empty when not yet captured. */
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

export function buildGuestInfoBlock(input: GuestInfoInput): string {
  const lineStyle = "margin:0 0 6px;color:#312b24;font-size:13px;line-height:19px;"
  const rowStyle = "margin:0 0 4px;color:#312b24;font-size:13px;line-height:19px;"

  const lines: string[] = []

  if (input.guests.length > 0) {
    for (const guest of input.guests) {
      const idText = guest.idNumber ? `ID: ${escapeHtml(guest.idNumber)}` : "ID not yet on file"
      lines.push(`<p style="${rowStyle}">${escapeHtml(guest.name)} ${idText}</p>`)
    }
  } else {
    const paxCount = formatPaxCount(input.adults, input.children)
    if (paxCount) {
      lines.push(`<p style="${lineStyle}"><strong>Guests:</strong> ${escapeHtml(paxCount)}</p>`)
    }
  }

  return (
    `<div style="margin:18px 0;padding:14px 16px;background-color:#fbf8f3;border:1px solid #e8dfd2;" data-label="Guest Information">` +
    `<p style="margin:0 0 6px;color:#172018;font-size:13px;font-weight:700;">Please confirm your booking details, including ID numbers, are correct</p>` +
    lines.join("") +
    `</div>`
  )
}
