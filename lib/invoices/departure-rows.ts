import type { VoucherServiceBlock, VoucherServiceType } from "@/lib/generate-voucher"
import { voucherRowsForBlock, type VoucherRow } from "@/lib/voucher/service-block-rows"

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
])

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
    .map(toInvoiceRow)
}
