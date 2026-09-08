import type { VoucherServiceBlock, VoucherServiceType } from "@/lib/generate-voucher"
import { formatBlockDate, houseTime, voucherRowsForBlock, type VoucherRow } from "@/lib/voucher/service-block-rows"

export interface InvoiceDepartureCell {
  label: string
  value: string
}

/** One printed line of the journey block: a left label/value pair and an optional right one,
 *  matching the invoice's existing two-column grid. */
export interface InvoiceDepartureRow {
  left: InvoiceDepartureCell | null
  right: InvoiceDepartureCell | null
}

/** What the journey block calls the booked product, per kind — the label on the supplier-name
 *  row. Deliberately not `voucherServiceTypeLabel` from lib/generate-voucher, whose values
 *  ("Train Service") are block titles rather than a label for a name field. */
export const INVOICE_PRODUCT_LABEL: Record<VoucherServiceType, string> = {
  train: "Train",
  hotel: "Hotel",
  transfer: "Operator",
  tour: "Tour Operator",
  airline: "Airline",
  additional_service: "Service",
}

/**
 * Voucher rows a client invoice must not repeat: the supplier's reservation reference is internal,
 * the guest breakdown and passenger list already print above (from the invoice's own traveller/pax
 * fields), and notes/preferences/itinerary prose belong to the voucher's operational purpose, not
 * a billing document. Matched on `VoucherRow.label`, which lib/voucher/service-block-rows.ts
 * documents as each row's identity.
 */
export const INVOICE_OMITTED_VOUCHER_ROWS: ReadonlySet<string> = new Set([
  "Your Reference",
  "Booking Reference",
  "Guests",
  "Notes",
  "Requests",
  "Dietary",
  "Occasion",
  "Boarding Point",
  "Arrival Point",
  "Details",
  "Passengers",
  // The booking-level "Days" cell in productRows (pdf/invoice-document.tsx) already states the
  // trip's length; the leg's own route duration_days would print the same fact a second line down.
  "Duration",
])

/**
 * Date rows the invoice prints as two columns — `Departure: 30 November 2026` | `Time: 13h00` —
 * where the voucher folds both into one value ("… at 13h00"). The invoice grid has a right-hand
 * column the voucher's single-column list does not, and leaving it empty on every date row makes
 * the journey block read lopsided.
 *
 * Rebuilt from `serviceData` rather than split out of the rendered string. Only kinds whose value
 * is a plain date+time are listed: an airline's departure folds in an airport code and a tour's
 * start/end carry no time at all, so both are left exactly as the voucher builds them.
 */
const INVOICE_SPLIT_DATE_ROWS: Record<string, { label: string; date: "departureDate" | "arrivalDate"; time: "startTime" | "endTime" }> = {
  "Departure Date": { label: "Departure", date: "departureDate", time: "startTime" },
  "Arrival Date": { label: "Arrival", date: "arrivalDate", time: "endTime" },
  "Check-In": { label: "Check-In", date: "departureDate", time: "startTime" },
  "Check-Out": { label: "Check-Out", date: "arrivalDate", time: "endTime" },
}

function splitDateRow(row: VoucherRow, block: VoucherServiceBlock): InvoiceDepartureRow | null {
  const split = INVOICE_SPLIT_DATE_ROWS[row.label]
  if (!split) return null
  const date = formatBlockDate(block.serviceData[split.date])
  const time = block.serviceData[split.time]
  return {
    // The voucher's own fallbacks: a missing departure is an em dash, a missing arrival is "TBC".
    left: { label: split.label, value: date ?? String(row.value ?? "—") },
    right: date && time ? { label: "Time", value: houseTime(time) } : null,
  }
}

function toInvoiceRow(row: VoucherRow): InvoiceDepartureRow {
  if (row.cells && row.cells.length > 0) {
    const [first, second] = row.cells
    return {
      left: { label: first.label, value: String(first.value) },
      right: second ? { label: second.label, value: String(second.value) } : null,
    }
  }
  return { left: { label: row.label, value: String(row.value ?? "—") }, right: null }
}

/**
 * The rows one leg contributes to the invoice's journey block, built from the exact same function
 * the voucher renders (`voucherRowsForBlock`) so the two documents can never again disagree about
 * what a booking is (F-P3-2: the invoice used to pick "the first train block" and print it under
 * rail-only labels, regardless of what the booking's actual product was).
 */
export function invoiceRowsForBlock(block: VoucherServiceBlock): InvoiceDepartureRow[] {
  return voucherRowsForBlock(block, { showInclusions: false })
    .filter((row) => !INVOICE_OMITTED_VOUCHER_ROWS.has(row.label))
    .map((row) => splitDateRow(row, block) ?? toInvoiceRow(row))
}
