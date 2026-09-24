import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InvoiceBalance } from "@/lib/invoices/calculate-balance"

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  calculateInvoiceBalance: vi.fn(),
  ensureInvoicePdf: vi.fn(async () => ({
    documentId: "doc-1",
    storagePath: "invoices/INV-1/invoice-INV-1.pdf",
    filename: "invoice-INV-1.pdf",
    contentBase64: Buffer.from("pdf").toString("base64"),
  })),
  composeEmail: vi.fn(async () => ({
    subject: "Payment received",
    bodyHtml: "<p>body</p>",
    bodyContentHtml: "<p>body</p>",
    warnings: [],
    signatureProfileId: null,
    signatureBrandId: null,
  })),
}))

vi.mock("@/lib/api/auth", () => ({ requireRole: mocks.requireRole }))
vi.mock("@/lib/invoices/calculate-balance", () => ({
  calculateInvoiceBalance: mocks.calculateInvoiceBalance,
}))
vi.mock("@/lib/invoices/ensure-invoice-pdf", () => ({ ensureInvoicePdf: mocks.ensureInvoicePdf }))
vi.mock("@/lib/templates/compose-email", () => ({ composeEmail: mocks.composeEmail }))
vi.mock("@/lib/templates/resolve-shared-tokens", () => ({
  resolveSharedEmailTokens: vi.fn(async () => ({
    tokens: {},
    blocks: {},
    primarySupplierId: null,
    primarySupplierKind: null,
  })),
}))
vi.mock("@/lib/payment-methods", () => ({
  getPaymentMethod: vi.fn(async () => ({ id: "pm-1", banking: {} })),
}))
vi.mock("@/lib/invoices/banking-details-block", () => ({
  buildBankingDetailsBlock: vi.fn(() => "<p>bank</p>"),
  buildPaymentReference: vi.fn(() => "REF"),
}))
vi.mock("@/lib/settings-access", () => ({
  getInvoiceStatusOptions: vi.fn(async () => [
    { role: "provisional", label: "Provisional" },
    { role: "confirmed", label: "Confirmed" },
    { role: "paid", label: "Paid in Full" },
    { role: "cancelled", label: "Cancelled" },
  ]),
}))

import { POST } from "./route"

const BOOKING_ID = "booking-1"

interface InvoiceRow {
  id: string
  kind: "deposit" | "final" | "full"
  amount: number
  deposit_percentage: number | null
  due_date: string | null
}

// Minimal query-builder stub: the route reads one booking (with its customer)
// and the newest invoice, optionally filtered by kind.
function buildSupabase(invoices: InvoiceRow[]) {
  const booking = {
    id: BOOKING_ID,
    booking_number: "LTT-2026-0001",
    customer_invoice_number: "INV-1",
    departure_date: "2026-12-01",
    deposit_paid: true,
    cancelled_at: null,
    assigned_salesperson_id: "sales-1",
    customer: { title: "Mr", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" },
  }
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const resolve = () => {
        if (table === "bookings") return { data: booking, error: null }
        const rows = invoices
          .filter((row) => (filters.kind ? row.kind === filters.kind : true))
          .map((row) => ({
            ...row,
            booking_id: BOOKING_ID,
            quote_id: "quote-1",
            status: "sent",
            invoice_number: "LTT-2026-0001-INV",
            currency: "ZAR",
            created_at: "2026-07-01T00:00:00.000Z",
            display_status: null,
            payment_method_id: null,
          }))
        return { data: rows[rows.length - 1] ?? null, error: null }
      }
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return chain
        },
        order: () => chain,
        limit: () => chain,
        single: async () => resolve(),
        maybeSingle: async () => resolve(),
      }
      return chain
    },
  }
}

function balance(overrides: Partial<InvoiceBalance>): InvoiceBalance {
  return {
    quote: {} as InvoiceBalance["quote"],
    quoteTotal: 10000,
    quoteSubtotal: 10000,
    agentCommission: 0,
    discount: 0,
    discountVisible: false,
    currency: "ZAR",
    totalPaid: 2500,
    lastPaymentAt: "2026-07-10",
    balance: 7500,
    ...overrides,
  } as InvoiceBalance
}

function mockAuth(supabase: unknown) {
  mocks.requireRole.mockResolvedValue({
    ok: true,
    value: { supabase, user: { id: "u1" }, profile: { clearanceLevel: "consultant" } },
  })
}

const params = { params: Promise.resolve({ id: BOOKING_ID }) }

const DEPOSIT: InvoiceRow = { id: "inv-dep", kind: "deposit", amount: 2500, deposit_percentage: 25, due_date: "2026-07-05" }
const FINAL: InvoiceRow = { id: "inv-fin", kind: "final", amount: 7500, deposit_percentage: null, due_date: "2026-10-01" }
const FULL: InvoiceRow = { id: "inv-full", kind: "full", amount: 10000, deposit_percentage: null, due_date: "2026-07-20" }

function composedKey(): unknown {
  return (mocks.composeEmail.mock.calls[0] as unknown[] | undefined)?.[1]
}

function pdfTotals(): Record<string, unknown> {
  const call = mocks.ensureInvoicePdf.mock.calls[0] as unknown[] | undefined
  return ((call?.[1] as { totals?: Record<string, unknown> } | undefined)?.totals ?? {})
}

describe("POST /api/jobs/[id]/payment-received", () => {
  beforeEach(() => {
    mocks.requireRole.mockReset()
    mocks.calculateInvoiceBalance.mockReset()
    mocks.composeEmail.mockClear()
    mocks.ensureInvoicePdf.mockClear()
  })

  it("keeps payment_received for a deposit payment with a balance still owing", async () => {
    mockAuth(buildSupabase([DEPOSIT]))
    mocks.calculateInvoiceBalance.mockResolvedValue(balance({ totalPaid: 2500, balance: 7500 }))

    const res = await POST(new Request("http://localhost"), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(composedKey()).toBe("payment_received")
    expect(body.paidInFull).toBe(false)
    expect(pdfTotals().depositAmount).toBe(2500)
    expect(pdfTotals().fullPayment).toBeUndefined()
  })

  it("uses full_payment_received for the final payment after a deposit", async () => {
    mockAuth(buildSupabase([DEPOSIT, FINAL]))
    mocks.calculateInvoiceBalance.mockResolvedValue(balance({ totalPaid: 10000, balance: 0 }))

    const res = await POST(new Request("http://localhost"), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(composedKey()).toBe("full_payment_received")
    expect(body.paidInFull).toBe(true)
    // Still a deposit-split booking: the ladder keeps its deposit row.
    expect(pdfTotals().depositAmount).toBe(2500)
  })

  it("uses full_payment_received and the full-payment ladder for a settled pay-in-full invoice", async () => {
    mockAuth(buildSupabase([FULL]))
    mocks.calculateInvoiceBalance.mockResolvedValue(balance({ totalPaid: 10000, balance: 0 }))

    const res = await POST(new Request("http://localhost"), params)

    expect(res.status).toBe(200)
    expect(composedKey()).toBe("full_payment_received")
    expect(pdfTotals()).toMatchObject({
      fullPayment: true,
      depositAmount: null,
      depositPercentage: null,
      finalDueDate: "2026-07-20",
    })
  })

  it("treats an overpaid booking as paid in full", async () => {
    mockAuth(buildSupabase([FULL]))
    mocks.calculateInvoiceBalance.mockResolvedValue(balance({ totalPaid: 10100, balance: -100 }))

    await POST(new Request("http://localhost"), params)

    expect(composedKey()).toBe("full_payment_received")
  })

  it("keeps payment_received and the full-payment ladder for a part-paid pay-in-full invoice", async () => {
    mockAuth(buildSupabase([FULL]))
    mocks.calculateInvoiceBalance.mockResolvedValue(balance({ totalPaid: 4000, balance: 6000 }))

    await POST(new Request("http://localhost"), params)

    expect(composedKey()).toBe("payment_received")
    expect(pdfTotals().fullPayment).toBe(true)
  })

  it("rejects when no payment has been recorded", async () => {
    mockAuth(buildSupabase([DEPOSIT]))
    mocks.calculateInvoiceBalance.mockResolvedValue(balance({ totalPaid: 0, balance: 10000 }))

    const res = await POST(new Request("http://localhost"), params)

    expect(res.status).toBe(422)
    expect(mocks.composeEmail).not.toHaveBeenCalled()
  })
})
