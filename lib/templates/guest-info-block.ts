// Builds the {{guestInfo}} block token for the deposit_request template:
// lets the customer confirm who the booking is for before final documents go
// out. Names + counts only — no DOB/passport/address, since that data is
// sensitive and often not yet captured this early in the pipeline.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export interface GuestInfoInput {
  customerName: string
  customerEmail: string | null
  /** Named travellers, formatted "Prefix First Last". Empty when not yet captured. */
  guestNames: string[]
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

  const lines = [
    `<p style="${lineStyle}"><strong>Booking contact:</strong> ${escapeHtml(input.customerName)}${
      input.customerEmail ? ` (${escapeHtml(input.customerEmail)})` : ""
    }</p>`,
  ]

  if (input.guestNames.length > 0) {
    lines.push(
      `<p style="${lineStyle}"><strong>Guests:</strong> ${escapeHtml(input.guestNames.join(", "))}</p>`,
    )
  } else {
    const paxCount = formatPaxCount(input.adults, input.children)
    if (paxCount) {
      lines.push(`<p style="${lineStyle}"><strong>Guests:</strong> ${escapeHtml(paxCount)}</p>`)
    }
  }

  return (
    `<div style="margin:18px 0;padding:14px 16px;background-color:#fbf8f3;border:1px solid #e8dfd2;" data-label="Guest Information">` +
    `<p style="margin:0 0 6px;color:#172018;font-size:13px;font-weight:700;">Please confirm your booking details</p>` +
    lines.join("") +
    `</div>`
  )
}
