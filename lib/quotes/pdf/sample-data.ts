import type { QuotePdfData } from "@/lib/quotes/pdf/quote-document"

// Sample quote fixture for /api/pdf-preview. Title/footer come from the
// document-text settings, so they are excluded here.
export function sampleQuotePdfData(): Omit<QuotePdfData, "title" | "footerText"> {
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return {
    quoteNumber: "BT-2026-0001_Q1",
    bookingNumber: "BT-2026-0001",
    customerName: "Mr & Mrs Sample Guest",
    quoteDate: new Date().toISOString().slice(0, 10),
    validUntil,
    lineItems: [
      {
        description: "Rovos Rail — Cape Town to Pretoria, Double Deluxe Suite",
        supplierDescription: "Luxury rail journeys through Southern Africa since 1989.",
        qty: 1,
        unit: "suite",
        unitPrice: 61500,
        total: 61500,
      },
      {
        description: "The Silo Hotel — Superior Suite, 2 nights",
        qty: 2,
        unit: "night",
        unitPrice: 18500,
        total: 37000,
      },
      {
        description: "Private transfer — hotel to station",
        qty: 1,
        unitPrice: 0,
        total: 0,
      },
    ],
    subtotal: 85652.17,
    vat: 12847.83,
    total: 98500,
    currency: "ZAR",
    statusLabel: "Provisional",
  }
}
