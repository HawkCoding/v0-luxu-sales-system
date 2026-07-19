import {
  DEFAULT_INVOICE_STATUS_OPTIONS,
  type InvoiceStatusOption,
  type InvoiceStatusRole,
} from "@/lib/settings-access"

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

/** The one client-facing invoice number for a booking, e.g. LTT-2026-0001-INV. */
export function unifiedInvoiceNumber(bookingNumber: string): string {
  return `${bookingNumber}-INV`
}
