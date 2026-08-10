import {
  DEFAULT_INVOICE_STATUS_OPTIONS,
  type InvoiceStatusOption,
  type InvoiceStatusRole,
} from "@/lib/invoices/invoice-status-options"

/**
 * The booking facts the client-facing invoice status is derived from. The
 * client receives one invoice whose status block moves through the configured
 * labels as the booking progresses.
 */
export interface InvoiceStatusFacts {
  depositPaid: boolean
  /** VAT-inclusive quote total minus payments received. */
  outstanding: number
  cancelled: boolean
}

export function deriveInvoiceStatusRole(facts: InvoiceStatusFacts): InvoiceStatusRole {
  if (facts.cancelled) return "cancelled"
  if (facts.outstanding <= 0) return "paid"
  if (facts.depositPaid) return "confirmed"
  return "provisional"
}

/**
 * Resolve the label to print in the invoice header. A manual override wins;
 * otherwise the derived role is looked up in the configured options, falling
 * back to the built-in label when the role was deleted from Settings.
 */
export function resolveInvoiceStatusLabel(
  options: InvoiceStatusOption[],
  facts: InvoiceStatusFacts,
  override?: string | null,
): string {
  const manual = override?.trim()
  if (manual) return manual
  const role = deriveInvoiceStatusRole(facts)
  return (
    options.find((option) => option.role === role)?.label ??
    DEFAULT_INVOICE_STATUS_OPTIONS.find((option) => option.role === role)?.label ??
    "Provisional"
  )
}

/**
 * Final payment falls due 60 days before departure (sales team rule). Returns
 * null when the booking has no departure date yet; the PDF then prints "Now".
 */
export function computeFinalDueDate(departureDate: string | null | undefined): string | null {
  const day = departureDate?.slice(0, 10)
  if (!day) return null
  const parsed = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setUTCDate(parsed.getUTCDate() - 60)
  return parsed.toISOString().slice(0, 10)
}

/** True when the computed final due date is today or already past. */
export function isFinalDueNow(
  finalDueDate: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (!finalDueDate) return true
  return finalDueDate <= today
}

/**
 * The internal invoice number for a booking, e.g. LTT-2026-0001-INV. Stored on
 * `invoices.invoice_number` and used only for backend tracking (storage paths,
 * filenames). It is NOT shown to the customer — see `clientInvoiceNumber`.
 */
export function unifiedInvoiceNumber(bookingNumber: string): string {
  return `${bookingNumber}-INV`
}

/**
 * The invoice number the customer sees on PDFs, emails, and as the bank payment
 * reference. This is the salesperson-entered `bookings.customer_invoice_number`;
 * when it has not been entered yet, we fall back to the internal auto number so
 * documents never render blank. A hard stage gate ensures it is filled before the
 * deposit invoice is actually sent.
 */
export function clientInvoiceNumber(booking: {
  customer_invoice_number: string | null
  booking_number: string
}): string {
  return booking.customer_invoice_number?.trim() || unifiedInvoiceNumber(booking.booking_number)
}

/**
 * The reference internal list and board views lead with (pipeline cards, All
 * Items rows). Salespeople recognise a booking by the invoice number they
 * typed in, so that wins; until it is captured we fall back to the system
 * booking number — not the `-INV` auto number, which is a backend-only handle
 * and would be noise on screen. Takes the camelCase API shape, not DB rows.
 */
export function bookingDisplayReference(booking: {
  customerInvoiceNumber?: string | null
  bookingNumber: string
}): string {
  return booking.customerInvoiceNumber?.trim() || booking.bookingNumber
}
