import type { VoucherServiceBlock, VoucherServiceBlockContact, VoucherServiceType } from "@/lib/generate-voucher"
import { formatDisplayDateLong } from "@/lib/date-format"
import { formatBulletLinesInline } from "@/lib/inclusions/bullet-lines"

export interface VoucherRowCell {
  label: string
  value: string | number
  /** How many of the row's columns this cell occupies. Cell rows are laid out on a grid whose
   * column count is the sum of the row's spans, so a two-cell row can still line its last cell up
   * with the last cell of a three-cell row below it — that's how "Qty" prints directly above
   * "Infant". Defaults to 1. */
  span?: number
}

export interface VoucherRow {
  /** Unique per block — used as the React/HTML key, and as the printed label for single-value rows. */
  label: string
  /** Single-value row (the common case). Ignored when `cells` is set. */
  value?: string | number
  /** Multi-cell row — e.g. "Suite Type | Qty" or "Adults | Children | Infant" — each cell prints
   * its own label above its value, laid out inline the way the legacy voucher tabled them. */
  cells?: VoucherRowCell[]
}

// Only ISO date-ish values are reformatted; anything else is already display text
// and must be passed through untouched (re-parsing "04/07/2026" would flip d/m).
function fmt(value: string | null | undefined): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return formatDisplayDateLong(value) || value
}

/** "07 September 2026 at 13h00" — a formatted date with its HH:MM time folded in, the way the
 * legacy voucher always paired a date with a time. `time` is HH:MM; rendered as HH:MM converted
 * to the "13h00" house style used on client documents. */
function fmtWithTime(date: string | null, time: string | null | undefined): string | null {
  if (!date) return null
  if (!time) return date
  return `${date} at ${houseTime(time)}`
}

/** "13h00" — HH:MM converted to the house style used on client documents. */
function houseTime(time: string): string {
  const [hours, minutes] = time.split(":")
  return `${hours}h${minutes}`
}

export interface VoucherRowOptions {
  /** Print the supplier's "Included" list on train and hotel blocks. The voucher turns this off —
   * it's operational paperwork handed over at travel time, and the inclusions were already sold on
   * the quote and the itinerary — the itinerary PDF keeps it on. */
  showInclusions?: boolean
}

/**
 * The single source of truth for a service block's printed rows — consumed by both the
 * react-pdf voucher (`sections/service-block.tsx`) and the HTML live preview
 * (`lib/generate-voucher.ts`). Previously each renderer duplicated this logic and had already
 * drifted (the PDF printed a "Duration" row for train blocks the preview didn't); keeping one
 * function here means the two documents can never again disagree on what a voucher shows.
 */
export function voucherRowsForBlock(
  block: VoucherServiceBlock,
  { showInclusions = true }: VoucherRowOptions = {},
): VoucherRow[] {
  const rows: VoucherRow[] = []
  const d = block.serviceData
  const departureDate = fmt(d.departureDate)
  const arrivalDate = fmt(d.arrivalDate)
  // Airline bookings have no named contact — a flight's "reference" is its booking number, and
  // the flight number gets its own row below (see the airline branch).
  rows.push(
    block.serviceType === "airline"
      ? { label: "Booking Reference", value: block.supplierReference || "—" }
      : { label: "Your Reference", value: referenceWithContact(block.supplierReference, block.supplierContactName) },
  )

  if (block.serviceType === "train") {
    if (d.route) rows.push({ label: "Route", value: d.route })
    // A train boards at a different station in every city it serves, so these are the leg's own
    // station addresses -- not the supplier's head office on the contact line above.
    if (d.boardingPoint) rows.push({ label: "Boarding Point", value: d.boardingPoint })
    if (d.arrivalPoint) rows.push({ label: "Arrival Point", value: d.arrivalPoint })
    if (d.durationDays != null) {
      rows.push({ label: "Duration", value: `${d.durationDays} ${d.durationDays === 1 ? "day" : "days"}` })
    }
    rows.push({ label: "Departure Date", value: fmtWithTime(departureDate, d.startTime) ?? "—" })
    rows.push({ label: "Arrival Date", value: fmtWithTime(arrivalDate, d.endTime) ?? "TBC" })
    if (d.suiteType) rows.push(suiteRow("Suite Type", d.suiteType, d.numberOfSuites))
    if (d.guestBreakdown) rows.push(guestsRow(d.guestBreakdown))
    if (d.mealPlan) rows.push({ label: "Meal Basis", value: d.mealPlan })
    // Subheadings can't have their own line in a single-value row, so their items are grouped
    // behind them: "Onboard: a, b; Off-train: c".
    const included = showInclusions ? formatBulletLinesInline(d.inclusions) : null
    if (included) rows.push({ label: "Included", value: included })
    // Smoking preference and meal seating are train-specific — the hotel branch below prints
    // dietary and occasion instead, the pair a hotel actually acts on.
    if (d.requestsLine) rows.push({ label: "Requests", value: d.requestsLine })
    // Excursions are deliberately not printed — not something clients have asked to see on the
    // voucher. The underlying data (route defaults, leg overrides) is left in place untouched.
  } else if (block.serviceType === "hotel") {
    if (d.roomType) rows.push(suiteRow("Room Type", d.roomType, d.numberOfSuites))
    if (d.nights != null) rows.push({ label: "Nights", value: d.nights })
    if (d.guestBreakdown) rows.push(guestsRow(d.guestBreakdown))
    if (d.mealPlan) rows.push({ label: "Meal Plan", value: d.mealPlan })
    if (departureDate) rows.push({ label: "Check-In", value: fmtWithTime(departureDate, d.startTime) ?? departureDate })
    if (arrivalDate) rows.push({ label: "Check-Out", value: fmtWithTime(arrivalDate, d.endTime) ?? arrivalDate })
    // Subheadings can't have their own line in a single-value row, so their items are grouped
    // behind them: "Onboard: a, b; Off-train: c".
    const included = showInclusions ? formatBulletLinesInline(d.inclusions) : null
    if (included) rows.push({ label: "Included", value: included })
    // Dietary and occasion are the preferences a hotel acts on — smoking/meal seating print on
    // the train block instead.
    if (d.dietary) rows.push({ label: "Dietary", value: d.dietary })
    if (d.occasion) rows.push({ label: "Occasion", value: d.occasion })
  } else if (block.serviceType === "transfer") {
    if (d.passengerCount != null) rows.push({ label: "No of Guests", value: `${d.passengerCount} Adults` })
    if (d.vehicleType) rows.push({ label: "Vehicle", value: d.vehicleType })
    // Falls back to the leg's own route name only when the trip has neither a typed pickup nor
    // drop-off — without it such a block would state no location at all, now that the supplier's
    // office address no longer prints. Guarded here (not just upstream) so it can never duplicate
    // the two rows below.
    if (d.route && !d.pickup && !d.dropoff) rows.push({ label: "Route", value: d.route })
    const pickUp = pickUpLine(departureDate, d.pickup, d.startTime)
    if (pickUp) rows.push({ label: "Pick Up", value: pickUp })
    if (d.dropoff) rows.push({ label: "Drop-off", value: d.dropoff })
    if (d.flightNumber) rows.push({ label: "Flight", value: d.flightNumber })
    if (arrivalDate) {
      rows.push({ label: "Return", value: d.endTime ? `${arrivalDate} ${d.endTime}` : arrivalDate })
    }
  } else if (block.serviceType === "tour") {
    // The tour type is what was booked and priced; the itinerary (and its copy) describes it.
    if (d.suiteType) rows.push({ label: "Tour", value: d.suiteType })
    if (d.itinerary) rows.push({ label: "Itinerary", value: d.itinerary })
    if (d.itineraryDescription) rows.push({ label: "Details", value: d.itineraryDescription })
    if (departureDate) rows.push({ label: "Start Date", value: departureDate })
    if (arrivalDate) rows.push({ label: "End Date", value: arrivalDate })
  } else if (block.serviceType === "airline") {
    if (d.route) rows.push({ label: "Route", value: d.route })
    if (d.cabin) rows.push({ label: "Cabin", value: d.cabin })
    if (d.flightNumber) rows.push({ label: "Flight", value: d.flightNumber })
    if (d.passengerNames && d.passengerNames.length > 0) rows.push({ label: "Passengers", value: passengersLine(d.passengerNames) })
    if (departureDate) {
      rows.push({ label: "Departure", value: airportDateTime(departureDate, d.departureAirportCode, d.startTime) })
    }
    if (arrivalDate) {
      rows.push({ label: "Arrival", value: airportDateTime(arrivalDate, d.arrivalAirportCode, d.endTime) })
    }
    if (d.handLuggageKg != null || d.checkedLuggageKg != null) {
      rows.push({
        label: "Baggage",
        cells: [
          { label: "Hand Luggage", value: d.handLuggageKg != null ? `${d.handLuggageKg}kg` : "—" },
          { label: "Checked-in Luggage", value: d.checkedLuggageKg != null ? `${d.checkedLuggageKg}kg` : "—" },
        ],
      })
    }
    if (d.priorityBoarding) rows.push({ label: "Priority Boarding", value: "Yes" })
  }

  if (d.notes) rows.push({ label: "Notes", value: d.notes })

  return rows
}

/** "09 September 2026: The Blue Train Station at 18h00" — date, pickup point and time folded into
 * one row, matching the legacy voucher's single "Pick up" line instead of three separate rows. */
function pickUpLine(date: string | null, pickup: string | null | undefined, time: string | null | undefined): string | null {
  if (!date && !pickup) return null
  const point = pickup ?? "—"
  if (!date) return point
  const withTime = time ? `${point} at ${houseTime(time)}` : point
  return `${date}: ${withTime}`
}

/** "11 September 2026: CPT at 16h20" — date, airport code and time folded into one row, matching
 * the legacy voucher's single departure/arrival line instead of a separate airport-code row. */
function airportDateTime(date: string, code: string | null | undefined, time: string | null | undefined): string {
  const withTime = time ? `${code ? `${code} at ` : ""}${houseTime(time)}` : code
  return withTime ? `${date}: ${withTime}` : date
}

/** "1.1 Hans Ntshele Makweng  1.2 Manini Florence Theletsane" — numbered passenger list, matching
 * the legacy voucher's FlySafair passenger table. */
function passengersLine(names: string[]): string {
  return names.map((name, idx) => `1.${idx + 1} ${name}`).join("  ")
}

/** "38562 – Carla" — a supplier reference with its named contact folded in, the way the legacy
 * voucher printed "Your reference number: 38562 – Carla" as one line. */
function referenceWithContact(reference: string | null | undefined, contactName: string | null | undefined): string {
  const ref = reference ?? "—"
  return contactName ? `${ref} – ${contactName}` : ref
}

/** "Suite Type | Qty" / "Room Type | Qty" — a single two-cell row when a count is known, or a
 * plain single-value row when it isn't (legacy pre-cutover legs with no unit rows to count). The
 * name cell spans 2 of the row's 3 columns so "Qty" lines up with "Infant" in the Guests row
 * below it, instead of splitting the value area in half. */
function suiteRow(label: string, name: string, qty: number | null | undefined): VoucherRow {
  if (qty == null) return { label, value: name }
  return { label, cells: [{ label, value: name, span: 2 }, { label: "Qty", value: qty }] }
}

/** "Adults | Children | Infant" — the per-block guest breakdown, tabled the way the legacy
 * voucher printed it. */
function guestsRow(breakdown: { adults: number; children: number; infants: number }): VoucherRow {
  return {
    label: "Guests",
    cells: [
      { label: "Adults", value: breakdown.adults },
      { label: "Children", value: breakdown.children },
      { label: "Infant", value: breakdown.infants },
    ],
  }
}

/** Categories whose supplier address is the place the guest physically arrives at. Every other
 * category prints a back-office address the guest never visits — a transfer operator's depot, an
 * airline's head office — and a train's real address is its per-city boarding point instead (see
 * the Boarding Point / Arrival Point rows above, resolved from `supplier_station_addresses`). */
const ADDRESS_IS_A_DESTINATION: ReadonlySet<VoucherServiceType> = new Set(["hotel", "tour"])

/** "Tel: … – Emergency: … • {website} • {street address}, {location}" — printed as a single small
 * line under the provider name, not as a table row; matches the legacy voucher's contact line
 * directly under each supplier's heading rather than buried at the bottom of the details table.
 * The supplier's email is deliberately never printed here — it's not something client-facing
 * paperwork should expose, even though it's still selected and typed on `contact` for other uses.
 * The address segment only prints for categories where that address is somewhere the guest goes —
 * see `ADDRESS_IS_A_DESTINATION`. */
export function voucherProviderContactLine(
  contact: VoucherServiceBlockContact,
  serviceType: VoucherServiceType,
): string | null {
  const parts: string[] = []
  if (contact.phone) {
    parts.push(contact.emergencyPhone ? `Tel: ${contact.phone} – Emergency: ${contact.emergencyPhone}` : `Tel: ${contact.phone}`)
  } else if (contact.emergencyPhone) {
    parts.push(`Emergency: ${contact.emergencyPhone}`)
  }
  if (contact.website) parts.push(contact.website)
  if (ADDRESS_IS_A_DESTINATION.has(serviceType)) {
    const address = [contact.streetAddress, contact.location].filter(Boolean).join(", ")
    if (address) parts.push(address)
  }
  return parts.length > 0 ? parts.join(" • ") : null
}
