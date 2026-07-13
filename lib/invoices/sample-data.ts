import type { InvoicePdfData } from "@/lib/invoices/pdf/invoice-document"

// Sample invoice fixture for /api/pdf-preview. Banking details and the
// document-text titles/footer come from real settings, so they are excluded.
export function sampleInvoicePdfData(): Omit<
  InvoicePdfData,
  "banking" | "depositTitle" | "finalTitle" | "footerText"
> {
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    invoiceNumber: "BT-2026-0001-D1",
    bookingNumber: "BT-2026-0001",
    customerName: "Mr & Mrs Sample Guest",
    kind: "deposit",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate,
    lines: [
      { label: "Quote total", value: "R 98 500.00" },
      { label: "Deposit (25%)", value: "R 24 625.00" },
      { label: "Payments received", value: "R 0.00" },
    ],
    amountDue: 24625,
    currency: "ZAR",
    statusLabel: "Sent",
  }
}
