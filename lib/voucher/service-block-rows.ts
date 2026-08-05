import type { VoucherServiceBlock, VoucherServiceBlockContact } from "@/lib/generate-voucher"
import { formatDisplayDateLong } from "@/lib/date-format"

export interface VoucherRowCell {
  label: string
  value: string | number
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
  const [hours, minutes] = time.split(":")
  return `${date} at ${hours}h${minutes}`
}

/**
 * The single source of truth for a service block's printed rows — consumed by both the
 * react-pdf voucher (`sections/service-block.tsx`) and the HTML live preview
 * (`lib/generate-voucher.ts`). Previously each renderer duplicated this logic and had already
 * drifted (the PDF printed a "Duration" row for train blocks the preview didn't); keeping one
 * function here means the two documents can never again disagree on what a voucher shows.
 */
export function voucherRowsForBlock(block: VoucherServiceBlock): VoucherRow[] {
  const rows: VoucherRow[] = []
  const d = block.serviceData
  const departureDate = fmt(d.departureDate)
  const arrivalDate = fmt(d.arrivalDate)
  rows.push({ label: "Your Reference", value: referenceWithContact(block.supplierReference, block.supplierContactName) })

  if (block.serviceType === "train") {
    rows.push({ label: "Route", value: d.route ?? "—" })
    if (d.durationDays != null) {
      rows.push({ label: "Duration", value: `${d.durationDays} ${d.durationDays === 1 ? "day" : "days"}` })
    }
    rows.push({ label: "Departure Date", value: fmtWithTime(departureDate, d.startTime) ?? "—" })
    rows.push({ label: "Arrival Date", value: fmtWithTime(arrivalDate, d.endTime) ?? "TBC" })
    rows.push(suiteRow("Suite Type", d.suiteType ?? "—", d.numberOfSuites))
    if (d.guestBreakdown) rows.push(guestsRow(d.guestBreakdown))
    if (d.mealPlan) rows.push({ label: "Meal Basis", value: d.mealPlan })
    if (d.inclusions && d.inclusions.length > 0) rows.push({ label: "Included", value: d.inclusions.join(", ") })
    if (d.requestsLine) rows.push({ label: "Requests", value: d.requestsLine })
    if (d.occasion) rows.push({ label: "Occasion", value: d.occasion })
    if (d.excursions && d.excursions.length > 0) rows.push({ label: "Excursion", value: d.excursions.join("; ") })
  } else if (block.serviceType === "hotel") {
    if (d.roomType) rows.push(suiteRow("Room Type", d.roomType, d.numberOfSuites))
    if (d.nights != null) rows.push({ label: "Nights", value: d.nights })
    if (d.guestBreakdown) rows.push(guestsRow(d.guestBreakdown))
    if (d.mealPlan) rows.push({ label: "Meal Plan", value: d.mealPlan })
    if (departureDate) rows.push({ label: "Check-In", value: fmtWithTime(departureDate, d.startTime) ?? departureDate })
    if (arrivalDate) rows.push({ label: "Check-Out", value: fmtWithTime(arrivalDate, d.endTime) ?? arrivalDate })
    if (d.inclusions && d.inclusions.length > 0) rows.push({ label: "Included", value: d.inclusions.join(", ") })
    if (d.requestsLine) rows.push({ label: "Requests", value: d.requestsLine })
    if (d.occasion) rows.push({ label: "Occasion", value: d.occasion })
  } else if (block.serviceType === "transfer") {
    if (d.passengerCount != null) rows.push({ label: "No of Guests", value: `${d.passengerCount} Adults` })
    if (d.vehicleType) rows.push({ label: "Vehicle", value: d.vehicleType })
    if (d.pickup) rows.push({ label: "Pickup", value: d.pickup })
    if (d.dropoff) rows.push({ label: "Drop-off", value: d.dropoff })
    if (departureDate) rows.push({ label: "Date", value: departureDate })
    if (d.startTime) rows.push({ label: "Pickup Time", value: d.startTime })
    if (d.flightNumber) rows.push({ label: "Flight", value: d.flightNumber })
    if (arrivalDate) {
      rows.push({ label: "Return", value: d.endTime ? `${arrivalDate} ${d.endTime}` : arrivalDate })
    }
  } else if (block.serviceType === "tour") {
    if (d.itinerary) rows.push({ label: "Itinerary", value: d.itinerary })
    if (departureDate) rows.push({ label: "Start Date", value: departureDate })
    if (arrivalDate) rows.push({ label: "End Date", value: arrivalDate })
  } else if (block.serviceType === "airline") {
    if (d.route) rows.push({ label: "Route", value: d.route })
    if (d.cabin) rows.push({ label: "Cabin", value: d.cabin })
    if (d.flightNumber) rows.push({ label: "Flight", value: d.flightNumber })
    if (d.departureAirportCode) rows.push({ label: "Departure Airport", value: d.departureAirportCode })
    if (departureDate) rows.push({ label: "Departure", value: fmtWithTime(departureDate, d.startTime) ?? departureDate })
    if (d.arrivalAirportCode) rows.push({ label: "Arrival Airport", value: d.arrivalAirportCode })
    if (arrivalDate) rows.push({ label: "Arrival", value: fmtWithTime(arrivalDate, d.endTime) ?? arrivalDate })
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
  if (d.footnote) rows.push({ label: "Note", value: d.footnote })

  return rows
}

/** "38562 – Carla" — a supplier reference with its named contact folded in, the way the legacy
 * voucher printed "Your reference number: 38562 – Carla" as one line. */
function referenceWithContact(reference: string | null | undefined, contactName: string | null | undefined): string {
  const ref = reference ?? "—"
  return contactName ? `${ref} – ${contactName}` : ref
}

/** "Suite Type | Qty" / "Room Type | Qty" — a single two-cell row when a count is known, or a
 * plain single-value row when it isn't (legacy pre-cutover legs with no unit rows to count). */
function suiteRow(label: string, name: string, qty: number | null | undefined): VoucherRow {
  if (qty == null) return { label, value: name }
  return { label, cells: [{ label, value: name }, { label: "Qty", value: qty }] }
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

/** "Tel: … – Emergency: … • Email: … • {street address}, {location}" — printed as a single small
 * line under the provider name, not as a table row; matches the legacy voucher's contact line
 * directly under each supplier's heading rather than buried at the bottom of the details table. */
export function voucherProviderContactLine(contact: VoucherServiceBlockContact): string | null {
  const parts: string[] = []
  if (contact.phone) {
    parts.push(contact.emergencyPhone ? `Tel: ${contact.phone} – Emergency: ${contact.emergencyPhone}` : `Tel: ${contact.phone}`)
  } else if (contact.emergencyPhone) {
    parts.push(`Emergency: ${contact.emergencyPhone}`)
  }
  if (contact.email) parts.push(`Email: ${contact.email}`)
  const address = [contact.streetAddress, contact.location].filter(Boolean).join(", ")
  if (address) parts.push(address)
  return parts.length > 0 ? parts.join(" • ") : null
}
