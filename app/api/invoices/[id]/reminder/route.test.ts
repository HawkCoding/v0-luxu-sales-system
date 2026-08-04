import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const pdfMocks = vi.hoisted(() => ({
  ensureInvoicePdf: vi.fn(async () => ({
    documentId: "doc-1",
    storagePath: "invoices/INV-CUSTOM-99/invoice-INV-CUSTOM-99.pdf",
    filename: "invoice-INV-CUSTOM-99.pdf",
    contentBase64: Buffer.from("pdf").toString("base64"),
  })),
}))

const composeMocks = vi.hoisted(() => ({
  composeEmail: vi.fn(async () => ({
    subject: "Payment Reminder — Invoice BT-2026-0001-DEP1",
    bodyHtml: "<html><p>reminder</p></html>",
    bodyContentHtml: "<p>reminder</p>",
    warnings: [],
  })),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/invoices/ensure-invoice-pdf", () => ({
  ensureInvoicePdf: pdfMocks.ensureInvoicePdf,
  INVOICE_BUCKET: "invoices",
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: composeMocks.composeEmail,
}))

vi.mock("@/lib/settings-access", () => ({
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

const INVOICE_ID = "00000000-0000-4000-8000-00000000dddd"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function seed(invoiceOverrides: Record<string, unknown> = {}) {
  return createSupabaseMock({
    invoices: [
      {
        id: INVOICE_ID,
        booking_id: BOOKING_ID,
        kind: "deposit",
        status: "sent",
        invoice_number: "BT-2026-0001-DEP1",
        amount: 250,
        currency: "ZAR",
        due_date: daysAgo(3),
        created_at: "2026-07-01T00:00:00.000Z",
        ...invoiceOverrides,
      },
    ],
    bookings: [
      {
        id: BOOKING_ID,
        booking_number: "BT-2026-0001",
        customer_invoice_number: "INV-CUSTOM-99",
        customer_id: "customer-1",
      },
    ],
    customers: [
      { id: "customer-1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" },
    ],
    payment_reminders: [],
  })
}

function mockAuthOk(supabase: unknown) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1", email: "user@example.test" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })
}

function routeParams() {
  return { params: Promise.resolve({ id: INVOICE_ID }) }
}

describe("POST /api/invoices/[id]/reminder", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    composeMocks.composeEmail.mockClear()
    pdfMocks.ensureInvoicePdf.mockClear()
  })

  it("prepares a reminder email with the invoice PDF attached", async () => {
    const { supabase } = seed()
    mockAuthOk(supabase)

    const res = await POST(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.email.subject).toContain("Payment Reminder")
    expect(body.email.to).toBe("ada@example.test")
    // Filename, email, and response all use the customer-facing (salesperson-
    // entered) invoice number, not the internal invoices.invoice_number.
    expect(body.attachment.filename).toBe("invoice-INV-CUSTOM-99.pdf")
    expect(body.invoice.invoiceNumber).toBe("INV-CUSTOM-99")
    expect(body.invoice.daysOverdue).toBe(3)
    expect(composeMocks.composeEmail).toHaveBeenCalledWith(
      expect.anything(),
      "payment_reminder",
      expect.objectContaining({
        tokens: expect.objectContaining({
          invoiceNumber: "INV-CUSTOM-99",
          daysOverdue: "3",
        }),
      }),
    )
  })

  it("returns 400 when no invoice number has been entered on the job", async () => {
    const { supabase } = createSupabaseMock({
      invoices: [
        {
          id: INVOICE_ID,
          booking_id: BOOKING_ID,
          kind: "deposit",
          status: "sent",
          invoice_number: "BT-2026-0001-DEP1",
          amount: 250,
          currency: "ZAR",
          due_date: daysAgo(3),
          created_at: "2026-07-01T00:00:00.000Z",
        },
      ],
      bookings: [{ id: BOOKING_ID, booking_number: "BT-2026-0001", customer_id: "customer-1" }],
      customers: [{ id: "customer-1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" }],
      payment_reminders: [],
    })
    mockAuthOk(supabase)

    const res = await POST(new Request("http://localhost"), routeParams())

    expect(res.status).toBe(400)
    expect(pdfMocks.ensureInvoicePdf).not.toHaveBeenCalled()
  })

  it("rejects reminders for paid invoices", async () => {
    const { supabase } = seed({ status: "paid" })
    mockAuthOk(supabase)

    const res = await POST(new Request("http://localhost"), routeParams())
    expect(res.status).toBe(409)
    expect(pdfMocks.ensureInvoicePdf).not.toHaveBeenCalled()
  })

  it("passes 401 through when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(new Request("http://localhost"), routeParams())
    expect(res.status).toBe(401)
  })
})

describe("PATCH /api/invoices/[id]/reminder", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("records a sent reminder in payment_reminders", async () => {
    const { supabase, store } = seed()
    mockAuthOk(supabase)

    const res = await PATCH(new Request("http://localhost"), routeParams())
    expect(res.status).toBe(200)
    expect(store.rows("payment_reminders")[0]).toEqual(
      expect.objectContaining({ invoice_id: INVOICE_ID, status: "sent" }),
    )
  })
})
