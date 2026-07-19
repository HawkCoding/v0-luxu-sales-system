import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

const pdfMocks = vi.hoisted(() => ({
  ensureInvoicePdf: vi.fn(async () => ({
    documentId: "doc-1",
    storagePath: "invoices/BT-2026-0001-DEP1/invoice-BT-2026-0001-DEP1.pdf",
    filename: "invoice-BT-2026-0001-DEP1.pdf",
    contentBase64: Buffer.from("pdf").toString("base64"),
  })),
}))

vi.mock("@/lib/invoices/ensure-invoice-pdf", () => ({
  ensureInvoicePdf: pdfMocks.ensureInvoicePdf,
  INVOICE_BUCKET: "invoices",
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: vi.fn(async () => ({
    subject: "Deposit Invoice — BT-2026-0001",
    bodyHtml: "<html><p>invoice</p></html>",
    bodyContentHtml: "<p>invoice</p>",
    warnings: [],
  })),
}))

vi.mock("@/lib/settings-access", () => ({
  getBankingSettings: vi.fn(async () => ({
    bank_name: "Example Bank",
    bank_account_name: "",
    bank_account_number: "",
    bank_branch_code: "",
    bank_swift_code: "",
    payment_reference_hint: "",
    company_address: "",
    company_reg_number: "",
    company_vat_number: "",
    company_tel: "",
    company_cell: "",
    company_fax: "",
    company_email: "",
    company_website: "",
  })),
  getInvoiceStatusOptions: vi.fn(async () => [
    { role: "provisional", label: "Provisional" },
    { role: "confirmed", label: "Confirmed" },
    { role: "paid", label: "Paid in Full" },
    { role: "cancelled", label: "Cancelled" },
  ]),
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function postJson(body: unknown) {
  return new Request("http://localhost/api/invoices/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function seedSupabase(quotes: MockRow[]) {
  return createSupabaseMock({
    bookings: [{ id: BOOKING_ID, booking_number: "BT-2026-0001", customer_id: "customer-1" }],
    customers: [{ id: "customer-1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" }],
    quotes,
    invoices: [],
    documents: [],
  })
}

function mockAuthOk(supabase: unknown) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "user@example.test" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })
}

describe("POST /api/invoices/deposit", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("uses only accepted quotes for deposit invoice generation", async () => {
    const { supabase, store } = seedSupabase([
      { id: "quote-accepted", booking_id: BOOKING_ID, total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" },
      { id: "quote-sent", booking_id: BOOKING_ID, total: 9999, status: "sent", created_at: "2026-05-02T00:00:00.000Z" },
    ])
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))
    const body = (await res.json()) as {
      invoice: { amount: number; invoiceNumber: string }
      attachment: { filename: string }
    }

    expect(res.status).toBe(200)
    // 25% of the accepted quote (1000), never the sent quote (9999)
    expect(body.invoice.amount).toBe(250)
    expect(body.invoice.invoiceNumber).toBe("BT-2026-0001-INV")
    expect(store.rows("invoices")[0]).toEqual(
      expect.objectContaining({ kind: "deposit", quote_id: "quote-accepted", amount: 250 }),
    )
    // The real PDF pipeline (render + upload + documents row) is delegated
    expect(pdfMocks.ensureInvoicePdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingNumber: "BT-2026-0001" }),
    )
    expect(body.attachment.filename).toBe("invoice-BT-2026-0001-DEP1.pdf")
  })

  it("returns 422 when there is no priced accepted quote", async () => {
    const { supabase, store } = seedSupabase([
      { id: "quote-sent", booking_id: BOOKING_ID, total: 1000, status: "sent", created_at: "2026-05-02T00:00:00.000Z" },
    ])
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(422)
    expect(store.rows("invoices")).toHaveLength(0)
  })
})
