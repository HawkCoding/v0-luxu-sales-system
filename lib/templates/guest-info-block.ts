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
  /** travellers.pax_group_id — the suite the guest is placed in. Only read in group mode. */
  paxGroupId?: string | null
  /** A child prints " – CHD 8" after their line in group mode. */
  isChild?: boolean
  /** The child's age (childAgesForTravellers); null prints " – CHD" alone. */
  childAge?: number | null
}

/** A booking split into pax groups, as the grouped block heads and numbers it. */
export interface GuestInfoPaxGroups {
  groups: ReadonlyArray<{ id: string; position: number }>
  /** buildGuestHeadings (lib/pax-groups/booking-pax-groups.ts): one heading per group. */
  headings: ReadonlyArray<{ groupId: string; heading: string }>
}

export interface GuestInfoInput {
  customerName: string
  customerEmail: string | null
  /** Named travellers with their DOB/country/ID details, in roster order. Empty when not yet captured. */
  guests: GuestInfoGuest[]
  adults: number
  children: number
  /** Present on a booking split into pax groups: the guests print under a heading per group,
   *  numbered "2.1", "2.2". Ignored (the flat list prints) when no guest is placed in a group. */
  paxGroups?: GuestInfoPaxGroups | null
}

/** Whole years from a "YYYY-MM-DD" birth date to `asOf` (another date-only string, or today). */
function ageOn(dateOfBirth: string | null | undefined, asOf: string | null | undefined): number | null {
  const birth = DATE_ONLY_PATTERN.exec(dateOfBirth ?? "")
  if (!birth) return null
  const reference = DATE_ONLY_PATTERN.exec((asOf ?? "").slice(0, 10)) ?? DATE_ONLY_PATTERN.exec(new Date().toISOString().slice(0, 10))
  if (!reference) return null
  const [by, bm, bd] = birth.slice(1).map(Number)
  const [ry, rm, rd] = reference.slice(1).map(Number)
  const age = ry - by - (rm < bm || (rm === bm && rd < bd) ? 1 : 0)
  return age >= 0 ? age : null
}

/**
 * Each child traveller's age for the " – CHD 8" marker: from their date of birth at `asOf` (the
 * departure date), else the booking's child_ages in child order. Null for an adult, or a child
 * whose age is known neither way.
 */
export function childAgesForTravellers(
  travellers: ReadonlyArray<{ is_child?: boolean | null; date_of_birth?: string | null }>,
  bookingChildAges: readonly number[] | null | undefined,
  asOf: string | null | undefined,
): Array<number | null> {
  let childIndex = 0
  return travellers.map((traveller) => {
    if (!traveller.is_child) return null
    const fromList = bookingChildAges?.[childIndex]
    childIndex += 1
    const fromBirth = ageOn(traveller.date_of_birth, asOf)
    if (fromBirth !== null) return fromBirth
    return typeof fromList === "number" && Number.isFinite(fromList) ? fromList : null
  })
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

/** "2.1 Mr Hao Chen DOB: 01/07/2017 TW 300000003 – CHD 8". */
function formatNumberedGuestLine(guest: GuestInfoGuest, number: string | null): string {
  const child = guest.isChild ? ` – CHD${guest.childAge != null ? ` ${guest.childAge}` : ""}` : ""
  return `${number ? `${number} ` : ""}${formatGuestLine(guest)}${child}`
}

const NOT_PLACED_HEADING = "Not yet placed"

/**
 * The grouped GUEST DETAILS block: a small bold heading over each suite ("Deluxe Suite 2"), its
 * guests numbered "2.1", "2.2" under it in a paragraph of their own, and guests not yet placed in a
 * suite last under "Not yet placed". Null when no guest is placed in a known group (the caller
 * prints the flat list).
 */
function buildGroupedGuestLines(guests: GuestInfoGuest[], paxGroups: GuestInfoPaxGroups, rowStyle: string): string | null {
  if (paxGroups.groups.length < 2) return null
  const positionOf = new Map(paxGroups.groups.map((group) => [group.id, group.position]))
  if (!guests.some((guest) => guest.paxGroupId && positionOf.has(guest.paxGroupId))) return null

  const guestsOf = (groupId: string) => guests.filter((guest) => guest.paxGroupId === groupId)
  const paragraphs: Array<{ heading: string; lines: string[] }> = []
  const paragraph = (heading: string, lines: string[]) => paragraphs.push({ heading, lines })
  // The last suite's guests close the block with a paragraph's worth of air, so the template's next
  // line ("Reservation/Itinerary details") never runs straight on from "6.2 …".
  const lastStyle = rowStyle.replace(/margin:[^;]*;/, "margin:0 0 16px;")
  const render = ({ heading, lines }: { heading: string; lines: string[] }, last: boolean) =>
    `<p style="${last ? lastStyle : rowStyle}">${heading ? `<strong style="font-size:12px;">${escapeHtml(heading)}</strong><br/>` : ""}${lines.join("<br/>")}</p>`

  const headingOf = new Map(paxGroups.headings.map((entry) => [entry.groupId, entry.heading]))
  for (const group of [...paxGroups.groups].sort((a, b) => a.position - b.position)) {
    const members = guestsOf(group.id)
    if (members.length === 0) continue
    paragraph(
      headingOf.get(group.id) ?? "",
      members.map((guest, index) => formatNumberedGuestLine(guest, `${group.position}.${index + 1}`)),
    )
  }

  const unplaced = guests.filter((guest) => !guest.paxGroupId || !positionOf.has(guest.paxGroupId))
  if (unplaced.length > 0) {
    paragraph(NOT_PLACED_HEADING, unplaced.map((guest) => formatNumberedGuestLine(guest, null)))
  }
  return paragraphs.map((entry, index) => render(entry, index === paragraphs.length - 1)).join("")
}

/**
 * True when the flat list is a booking with one pax group (or none): fewer than two groups loaded
 * and the guests sit in at most one. Two or more distinct guest groups mean the groups failed to
 * load on a split booking, so numbering everyone "1.x" would mislead — those stay unnumbered. A
 * split booking with nobody placed yet also stays unnumbered.
 */
function isSingleGroupBooking(input: GuestInfoInput): boolean {
  if ((input.paxGroups?.groups.length ?? 0) >= 2) return false
  const placedGroups = new Set(input.guests.map((guest) => guest.paxGroupId).filter(Boolean))
  return placedGroups.size <= 1
}

export function buildGuestInfoBlock(input: GuestInfoInput): string {
  const lineStyle = "margin:0 0 6px;color:#312b24;font-size:13px;line-height:19px;"
  const rowStyle = "margin:0 0 4px;color:#312b24;font-size:13px;line-height:19px;"

  const lines: string[] = []

  const grouped =
    input.guests.length > 0 && input.paxGroups ? buildGroupedGuestLines(input.guests, input.paxGroups, rowStyle) : null

  if (grouped) {
    lines.push(grouped)
  } else if (input.guests.length > 0) {
    // One paragraph with <br/> breaks: separate <p>s get a full paragraph gap in Outlook.
    // A single-group booking numbers its guests "1.1", "1.2" like a split one, just without a heading.
    const numbered = isSingleGroupBooking(input)
    const guestLines = input.guests
      .map((guest, index) => (numbered ? formatNumberedGuestLine(guest, `1.${index + 1}`) : formatGuestLine(guest)))
      .join("<br/>")
    lines.push(`<p style="${rowStyle}">${guestLines}</p>`)
  } else {
    const paxCount = formatPaxCount(input.adults, input.children)
    if (paxCount) {
      lines.push(`<p style="${lineStyle}"><strong>Guests:</strong> ${escapeHtml(paxCount)}</p>`)
    }
  }

  return lines.join("")
}
