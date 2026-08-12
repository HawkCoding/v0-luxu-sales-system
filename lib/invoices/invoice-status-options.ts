// Client-facing status labels shown in the invoice header. The four system
// roles drive automatic derivation from the booking's payment state; only their
// labels are configurable. Entries without a known role are dropped on read —
// nothing can apply them, since there is no per-invoice status picker.
//
// These live outside lib/settings-access.ts on purpose: that module imports the
// server Supabase client (and therefore next/headers), so anything a Client
// Component reaches — the pipeline page pulls in bookingDisplayReference from
// lib/invoices/invoice-status.ts — must not sit behind it. The reader that hits
// app_settings (getInvoiceStatusOptions) stays server-side in settings-access.

export type InvoiceStatusRole = "provisional" | "confirmed" | "paid" | "cancelled"

export interface InvoiceStatusOption {
  role: InvoiceStatusRole
  label: string
}

export const DEFAULT_INVOICE_STATUS_OPTIONS: InvoiceStatusOption[] = [
  { role: "provisional", label: "Provisional" },
  { role: "confirmed", label: "Confirmed" },
  { role: "paid", label: "Paid in Full" },
  { role: "cancelled", label: "Cancelled" },
]

const INVOICE_STATUS_ROLES: readonly string[] = ["provisional", "confirmed", "paid", "cancelled"]

export function parseInvoiceStatusOptions(value: string | null | undefined): InvoiceStatusOption[] {
  if (!value) return [...DEFAULT_INVOICE_STATUS_OPTIONS]
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return [...DEFAULT_INVOICE_STATUS_OPTIONS]
    const options = parsed
      .filter((entry): entry is { role?: unknown; label?: unknown } =>
        typeof entry === "object" && entry !== null,
      )
      .map((entry) => ({
        role:
          typeof entry.role === "string" && INVOICE_STATUS_ROLES.includes(entry.role)
            ? (entry.role as InvoiceStatusRole)
            : null,
        label: typeof entry.label === "string" ? entry.label.trim() : "",
      }))
      .filter((entry): entry is InvoiceStatusOption => entry.role !== null && entry.label.length > 0)
    return options.length > 0 ? options : [...DEFAULT_INVOICE_STATUS_OPTIONS]
  } catch {
    return [...DEFAULT_INVOICE_STATUS_OPTIONS]
  }
}
