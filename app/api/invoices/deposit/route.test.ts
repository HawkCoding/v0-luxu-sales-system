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
    storagePath: "invoices/244453/invoice-244453.pdf",
    filename: "invoice-244453.pdf",
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
  BANKING_SETTING_KEYS: [
    "bank_name",
    "bank_account_name",
    "bank_account_number",
    "bank_branch_code",
    "bank_swift_code",
    "company_address",
    "company_reg_number",
    "company_vat_number",
    "company_tel",
    "company_cell",
    "company_fax",
    "company_email",
    "company_website",
  ],
  getBankingSettings: vi.fn(async () => ({
    bank_name: "Example Bank",
    bank_account_name: "",
    bank_account_number: "",
    bank_branch_code: "",
    bank_swift_code: "",
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

import { PATCH, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function postJson(body: unknown) {
  return new Request("http://localhost/api/invoices/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function patchJson(body: unknown) {
  return new Request("http://localhost/api/invoices/deposit", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function seedSupabase(quotes: MockRow[], travellers: MockRow[] = [
  { id: "traveller-1", booking_id: BOOKING_ID, prefix: "Mrs", first_name: "Ada", last_name: "Lovelace", id_passport: "A1234567", sort_order: 0 },
], invoices: MockRow[] = []) {
  return createSupabaseMock({
    bookings: [
      { id: BOOKING_ID, booking_number: "BT-2026-0001", customer_invoice_number: "244453", customer_id: "customer-1" },
    ],
    customers: [{ id: "customer-1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" }],
    quotes,
    invoices,
    documents: [],
    travellers,
  })
}

const ACCEPTED_QUOTE: MockRow = {
  id: "quote-accepted",
  booking_id: BOOKING_ID,
  total: 1000,
  status: "accepted",
  created_at: "2026-05-01T00:00:00.000Z",
}

function invoiceRow(overrides: MockRow): MockRow {
  return {
    id: "invoice-1",
    booking_id: BOOKING_ID,
    quote_id: "quote-accepted",
    kind: "deposit",
    status: "draft",
    invoice_number: "BT-2026-0001-INV",
    deposit_percentage: 25,
    amount: 250,
    currency: "ZAR",
    due_date: "2026-05-04",
    created_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  }
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
    expect(body.invoice.invoiceNumber).toBe("244453")
    expect(store.rows("invoices")[0]).toEqual(
      expect.objectContaining({ kind: "deposit", quote_id: "quote-accepted", amount: 250 }),
    )
    // The real PDF pipeline (render + upload + documents row) is delegated
    expect(pdfMocks.ensureInvoicePdf).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingNumber: "BT-2026-0001" }),
    )
    expect(body.attachment.filename).toBe("invoice-244453.pdf")
  })

  it("returns 400 when no invoice number has been entered on the job", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [{ id: BOOKING_ID, booking_number: "BT-2026-0001", customer_id: "customer-1" }],
      customers: [{ id: "customer-1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" }],
      quotes: [{ id: "quote-accepted", booking_id: BOOKING_ID, total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" }],
      invoices: [],
      documents: [],
      travellers: [
        { id: "traveller-1", booking_id: BOOKING_ID, prefix: "Mrs", first_name: "Ada", last_name: "Lovelace", id_passport: "A1234567", sort_order: 0 },
      ],
    })
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(400)
    expect(store.rows("invoices")).toHaveLength(0)
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

  it("returns 422 when no travellers have been captured", async () => {
    const { supabase, store } = seedSupabase(
      [{ id: "quote-accepted", booking_id: BOOKING_ID, total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" }],
      [],
    )
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(422)
    expect(store.rows("invoices")).toHaveLength(0)
  })

  it("returns 422 when a traveller is missing an ID/passport number", async () => {
    const { supabase, store } = seedSupabase(
      [{ id: "quote-accepted", booking_id: BOOKING_ID, total: 1000, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" }],
      [{ id: "traveller-1", booking_id: BOOKING_ID, first_name: "Ada", last_name: "Lovelace", id_passport: "" }],
    )
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))

    expect(res.status).toBe(422)
    expect(store.rows("invoices")).toHaveLength(0)
  })

  it("voids the existing draft when the salesperson switches to full payment", async () => {
    const { supabase, store } = seedSupabase([ACCEPTED_QUOTE], undefined, [invoiceRow({})])
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 100, mode: "full" }))
    const body = (await res.json()) as { invoice: { kind: string; amount: number } }

    expect(res.status).toBe(200)
    expect(body.invoice).toEqual(expect.objectContaining({ kind: "full", amount: 1000 }))

    // One live invoice, not two sharing the same invoice number.
    const rows = store.rows("invoices")
    expect(rows).toHaveLength(2)
    expect(rows.filter((row) => row.status !== "void")).toHaveLength(1)
    expect(rows.find((row) => row.id === "invoice-1")?.status).toBe("void")
  })

  it("re-prices a sent invoice in place when its quote has been superseded", async () => {
    const { supabase, store } = seedSupabase(
      [
        { ...ACCEPTED_QUOTE, id: "quote-old", status: "superseded" },
        { id: "quote-revised", booking_id: BOOKING_ID, total: 2000, status: "accepted", created_at: "2026-06-01T00:00:00.000Z" },
      ],
      undefined,
      [invoiceRow({ quote_id: "quote-old", status: "sent" })],
    )
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))
    const body = (await res.json()) as { invoice: { id: string; amount: number } }

    expect(res.status).toBe(200)
    // Same invoice row, re-issued at 25% of the revised total.
    expect(body.invoice.id).toBe("invoice-1")
    expect(store.rows("invoices")).toHaveLength(1)
    expect(store.rows("invoices")[0]).toEqual(
      expect.objectContaining({ id: "invoice-1", quote_id: "quote-revised", amount: 500, status: "sent" }),
    )
  })

  it("reuses an unchanged draft rather than re-pricing it", async () => {
    const { supabase, store } = seedSupabase([ACCEPTED_QUOTE], undefined, [invoiceRow({})])
    mockAuthOk(supabase)

    // Same percentage the draft already carries: nothing to decide, so nothing is rewritten and the
    // PDF is not regenerated.
    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 25 }))
    const body = (await res.json()) as { invoice: { id: string; amount: number } }

    expect(res.status).toBe(200)
    expect(body.invoice).toEqual(expect.objectContaining({ id: "invoice-1", amount: 250 }))
    expect(store.rows("invoices")).toHaveLength(1)
  })

  // The reuse branch used to compare kind, quote and payment method but not the percentage, so a
  // re-issue at a different deposit percentage returned 200 with the old amount untouched — the
  // per-job override quietly doing nothing.
  it("amends a live draft when a different deposit percentage is requested", async () => {
    const { supabase, store } = seedSupabase([ACCEPTED_QUOTE], undefined, [invoiceRow({})])
    mockAuthOk(supabase)

    const res = await POST(postJson({ jobId: BOOKING_ID, depositPercentage: 50 }))
    const body = (await res.json()) as { invoice: { id: string; amount: number } }

    expect(res.status).toBe(200)
    expect(body.invoice).toEqual(expect.objectContaining({ id: "invoice-1", amount: 500 }))
    // Amended in place, not voided and re-raised: the booking keeps one live invoice.
    expect(store.rows("invoices")).toHaveLength(1)
    expect(store.rows("invoices")[0].deposit_percentage).toBe(50)
  })
})

describe("PATCH /api/invoices/deposit", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("refuses to discard an invoice the customer already has", async () => {
    const INVOICE_ID = "00000000-0000-4000-8000-0000000000b2"
    const { supabase, store } = seedSupabase([ACCEPTED_QUOTE], undefined, [
      invoiceRow({ id: INVOICE_ID, status: "sent" }),
    ])
    mockAuthOk(supabase)

    const res = await PATCH(patchJson({ invoiceId: INVOICE_ID, status: "void" }))

    expect(res.status).toBe(409)
    expect(store.rows("invoices")[0].status).toBe("sent")
  })

  it("voids a draft invoice without stamping sent_at", async () => {
    const INVOICE_ID = "00000000-0000-4000-8000-0000000000b3"
    const { supabase, store } = seedSupabase([ACCEPTED_QUOTE], undefined, [
      invoiceRow({ id: INVOICE_ID, status: "draft" }),
    ])
    mockAuthOk(supabase)

    const res = await PATCH(patchJson({ invoiceId: INVOICE_ID, status: "void" }))

    expect(res.status).toBe(200)
    expect(store.rows("invoices")[0].status).toBe("void")
    expect(store.rows("invoices")[0]).not.toHaveProperty("sent_at")
  })
})
