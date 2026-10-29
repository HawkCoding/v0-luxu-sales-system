import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InvoiceTotals } from "@/lib/invoices/pdf/invoice-document"

// ensureInvoicePdf → buildInvoiceView → resolvePayingPax → derivePerPersonTotals, end to end with
// every network boundary mocked: the PDF must divide by the projected paying headcount (an infant
// out, an over-age child in as an adult), bucketed by the quote's resolved primary supplier.

const renderInvoicePdf = vi.fn(async () => Buffer.from("%PDF-1.4"))
const resolveSupplierAgeBuckets = vi.fn(async () => ({ infantMax: 2, childMax: 12 }))
const loadQuoteConfig = vi.fn(async () => ({ primarySupplierId: "supplier-quote-primary" }))

vi.mock("@/lib/invoices/render-invoice-pdf", () => ({ renderInvoicePdf }))
vi.mock("@/lib/packages/passenger-totals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/packages/passenger-totals")>()),
  resolveSupplierAgeBuckets,
}))
vi.mock("@/lib/quotes/load-quote-config", () => ({ loadQuoteConfig }))
vi.mock("@/lib/voucher/build-service-blocks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/voucher/build-service-blocks")>()),
  buildVoucherServiceBlocks: vi.fn(async () => ({ blocks: [] })),
}))
vi.mock("@/lib/consultant/resolve-consultant", () => ({ resolveConsultant: vi.fn(async () => ({ key: "CD" })) }))
vi.mock("@/lib/suppliers/load-supplier-kind", () => ({ loadSupplierKind: vi.fn(async () => "train_operator") }))
vi.mock("@/lib/payment-methods", () => ({ getPaymentMethod: vi.fn(async () => ({ banking: {} })) }))
vi.mock("@/lib/settings-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settings-access")>()),
  getDocumentTextSettings: vi.fn(async () => ({
    itinerary_doc_journey_heading: "Your Journey",
    invoice_doc_footer_text: "",
    invoice_doc_payment_note: "",
    invoice_doc_bank_charges_note: "",
  })),
  getDocumentBrandSettings: vi.fn(async () => ({})),
}))
vi.mock("@/lib/pdf/brand-logo", () => ({ loadBrandLogo: vi.fn(async () => null) }))
vi.mock("@/lib/documents/upsert-generated-document", () => ({
  upsertGeneratedDocument: vi.fn(async () => ({ id: "doc-1" })),
}))
vi.mock("@/lib/error-log", () => ({ logError: vi.fn() }))

function snapshot(passengerKind: string, unit: string, legId = "leg-train") {
  return { source: "pricing_engine", pricingMode: "rate_card", legId, passengerKind, unit, commission: null }
}

/** 3 paying adults (2 + the 15-year-old) on R30 000 fares, 1 child on R15 000, a free infant, and a
 *  R2 100 per-vehicle shuttle: R107 100 in all. */
const LINE_ITEMS = [
  { description: "Blue Train", qty: 3, unit_price: 30_000, total: 90_000, pricing_snapshot: snapshot("adult", "per person sharing") },
  { description: "Blue Train - Child", qty: 1, unit_price: 15_000, total: 15_000, pricing_snapshot: snapshot("child", "per person sharing") },
  { description: "Blue Train - Infant", qty: 1, unit_price: 0, total: 0, pricing_snapshot: snapshot("infant", "per person sharing") },
  { description: "Shuttle", qty: 1, unit_price: 2_100, total: 2_100, pricing_snapshot: snapshot("adult", "per vehicle", "leg-transfer") },
]

const BOOKING = {
  id: "booking-1",
  consultant: "CD",
  assigned_salesperson_id: null,
  no_of_adults: 2,
  no_of_children: 3,
  child_ages: [1, 8, 15],
  no_of_suites: 2,
  duration_nights: null,
  trip_start_date: null,
  trip_end_date: null,
  primary_supplier_id: "supplier-booking-primary",
  customer: { phone: null, email: null },
  route: null,
}

function fakeSupabase() {
  const results: Record<string, unknown> = {
    bookings: { data: BOOKING, error: null },
    travellers: { data: [], error: null },
    booking_reservation_details: { data: null, error: null },
    quote_line_items: { data: LINE_ITEMS, error: null },
    invoices: { error: null },
  }
  return {
    from: vi.fn((table: string) => {
      const result = results[table] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "eq", "order", "update", "in"]) chain[method] = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(async () => result)
      chain.single = vi.fn(async () => result)
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
      return chain
    }),
    storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ error: null })) })) },
  }
}

const TOTALS: InvoiceTotals = {
  subtotalInclVat: 107_100,
  depositPercentage: 25,
  depositAmount: 26_775,
  finalAmount: 80_325,
  amountReceived: 0,
  outstanding: 107_100,
}

describe("ensureInvoicePdf per-person rows", () => {
  beforeEach(() => {
    renderInvoicePdf.mockClear()
    resolveSupplierAgeBuckets.mockClear()
  })

  it("divides the total by the projected paying adults and children", async () => {
    const { ensureInvoicePdf } = await import("./ensure-invoice-pdf")
    await ensureInvoicePdf(fakeSupabase() as never, {
      invoice: {
        id: "invoice-1",
        booking_id: "booking-1",
        quote_id: "quote-1",
        invoice_number: "INV-1",
        amount: 107_100,
        currency: "ZAR",
        due_date: null,
        created_at: "2026-10-02T00:00:00Z",
        status: "sent",
      },
      bookingNumber: "LTT-26-0001",
      displayInvoiceNumber: "39023",
      customerName: "Carmen De Jongh",
      statusLabel: "Provisional",
      totals: TOTALS,
    })

    // Bucketed by the quote's resolved primary supplier, exactly as the quote PDF does.
    expect(resolveSupplierAgeBuckets).toHaveBeenCalledWith(expect.anything(), "supplier-quote-primary")
    expect(renderInvoicePdf).toHaveBeenCalledTimes(1)
    const [data] = renderInvoicePdf.mock.calls[0] as unknown as [{ totals: InvoiceTotals }]
    // 3 adults + 1 child (not the raw 2 + 3): fares scaled by R107 100 / R105 000 = 1.02.
    expect(data.totals.perAdult).toBe(30_600)
    expect(data.totals.perChild).toBe(15_300)
    expect((data.totals.perAdult ?? 0) * 3 + (data.totals.perChild ?? 0) * 1).toBe(107_100)
  })
})
