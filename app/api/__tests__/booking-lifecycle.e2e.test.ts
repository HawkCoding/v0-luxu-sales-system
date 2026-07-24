import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
import { createSupabaseMock, type MockRow, type SupabaseMock } from "@/lib/testing/supabase-mock"
import { validateTransition, type ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { calculateInvoiceBalance } from "@/lib/invoices/calculate-balance"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import type { PipelineStage } from "@/lib/types"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/invoices/ensure-invoice-pdf", () => ({
  // Mirrors the real helper's side effect: a documents row for the PDF.
  ensureInvoicePdf: vi.fn(async (supabase: never, { invoice }: { invoice: { booking_id: string; invoice_number: string } }) => {
    const client = supabase as unknown as {
      from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<unknown> }
    }
    await client.from("documents").insert({
      booking_id: invoice.booking_id,
      kind: "invoice_pdf",
      status: "generated",
      storage_path: `invoices/${invoice.invoice_number}/invoice-${invoice.invoice_number}.pdf`,
    })
    return {
      documentId: "doc-1",
      storagePath: `invoices/${invoice.invoice_number}/invoice-${invoice.invoice_number}.pdf`,
      filename: `invoice-${invoice.invoice_number}.pdf`,
      contentBase64: Buffer.from("pdf").toString("base64"),
    }
  }),
  INVOICE_BUCKET: "invoices",
}))

vi.mock("@/lib/templates/compose-email", () => ({
  composeEmail: vi.fn(async () => ({
    subject: "Invoice",
    bodyHtml: "<html><p>invoice</p></html>",
    bodyContentHtml: "<p>invoice</p>",
    warnings: [],
  })),
}))

vi.mock("@/lib/settings-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings-access")>()
  return {
    ...actual,
    getBankingSettings: vi.fn(async () => ({
      bank_name: "",
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
  }
})

import { POST as startQuote } from "@/app/api/jobs/[id]/start-quote/route"
import { POST as createQuote } from "@/app/api/quotes/route"
import { POST as createDepositInvoice } from "@/app/api/invoices/deposit/route"
import { POST as recordPayment } from "@/app/api/payments/route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const DEPARTURE_DATE = "2026-08-01"

const customer: MockRow = {
  id: "customer-1",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.test",
  phone: "+27110000000",
  country: "South Africa",
}

function seedStore(): SupabaseMock {
  return createSupabaseMock({
    customers: [{ ...customer }],
    bookings: [
      {
        id: BOOKING_ID,
        booking_number: "BT-2026-0001",
        customer_id: "customer-1",
        consultant: "LB",
        source: "web_form",
        stage: "enquiry",
        email_import_needs_review: false,
        email_import_review_resolved_at: null,
        reservation_form_received_at: "2026-05-05T00:00:00.000Z",
        customer_invoice_number: "BT-2026-0001-INV",
        departure_date: DEPARTURE_DATE,
        deposit_paid: false,
        invoice_balance: null,
        raw_text: null,
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ],
    quotes: [],
    invoices: [],
    payments: [],
    documents: [],
    correspondences: [],
    audit_logs: [],
    app_settings: [],
    travellers: [
      { id: "traveller-1", booking_id: BOOKING_ID, prefix: "Mrs", first_name: "Ada", last_name: "Lovelace", id_passport: "A1234567", sort_order: 0 },
    ],
  })
}

function mockAuthOk(supabase: unknown, clearanceLevel = "consultant") {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "user@example.test" },
      profile: { clearanceLevel, actorName: "Jane" },
    },
  })
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** Validate then apply a pipeline stage move against the shared store, mirroring the pipeline route. */
async function movePipeline(
  mock: SupabaseMock,
  targetStage: PipelineStage,
  manualConfirmations?: ManualConfirmations,
) {
  const booking = mock.store.rows("bookings")[0]
  const quotes = mock.store
    .rows("quotes")
    .map((q) => ({ id: q.id as string, status: q.status as string, total: q.total as number, created_at: q.created_at as string }))
  const documents = mock.store.rows("documents").map((d) => ({ id: d.id as string, kind: d.kind as string, status: d.status as string }))
  const correspondences = mock.store
    .rows("correspondences")
    .map((c) => ({ id: c.id as string, kind: c.kind as string, subject: c.subject as string, status: c.status as string }))
  const payments = mock.store
    .rows("payments")
    .filter((p) => p.booking_id === booking.id)
    .map((p) => ({ amount: p.amount as number }))

  const failures = validateTransition({
    booking: {
      id: booking.id as string,
      stage: booking.stage as PipelineStage,
      source: booking.source as string,
      email_import_needs_review: booking.email_import_needs_review as boolean,
      email_import_review_resolved_at: booking.email_import_review_resolved_at as string | null,
      reservation_form_received_at: booking.reservation_form_received_at as string | null,
      customer_invoice_number: booking.customer_invoice_number as string | null,
    },
    customer,
    targetStage,
    quotes,
    documents,
    correspondences,
    payments,
    manualConfirmations,
  })
  expect(failures).toEqual([])

  type ApplyInput = Parameters<typeof applyTransition>[1]
  await applyTransition(mock.supabase as never, {
    booking: {
      id: booking.id as string,
      booking_number: booking.booking_number as string,
      stage: booking.stage as PipelineStage,
      source: booking.source as ApplyInput["booking"]["source"],
      raw_text: null,
      updated_at: booking.updated_at as string,
      customer_id: booking.customer_id as string,
      consultant: booking.consultant as string,
    },
    departureDate: DEPARTURE_DATE,
    durationNights: 3,
    targetStage,
    actorName: "Jane",
    actorUserId: USER_ID,
    quotes: quotes as ApplyInput["quotes"],
    documents: documents as ApplyInput["documents"],
    correspondences: correspondences as ApplyInput["correspondences"],
    manualConfirmations,
    now: new Date("2026-06-10T10:00:00.000Z"),
  })
}

describe("booking lifecycle (route-level E2E)", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("drives a booking from enquiry through closed via real handlers + pipeline", async () => {
    const mock = seedStore()
    const { store } = mock
    mockAuthOk(mock.supabase)

    // 1. Start Quote -> first draft quote
    const startRes = await startQuote(jsonRequest(`http://localhost/api/jobs/${BOOKING_ID}/start-quote`, {}), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    expect(startRes.status).toBe(200)
    expect(store.rows("quotes")[0]).toMatchObject({ quote_number: "BT-2026-0001-Q1", status: "draft" })

    // 2. Price + send the quote
    const quoteRes = await createQuote(
      jsonRequest("http://localhost/api/quotes", { bookingId: BOOKING_ID, status: "sent", total: 1000 }),
    )
    expect(quoteRes.status).toBe(200)
    const sentQuote = store.rows("quotes").find((q) => q.status === "sent")
    expect(sentQuote).toMatchObject({ quote_number: "BT-2026-0001-Q2", total: 1000 })

    // 3. Pipeline: enquiry -> quote_sent -> accepted (flips the sent quote to accepted)
    await movePipeline(mock, "quote_sent")
    await movePipeline(mock, "accepted")
    expect(store.rows("quotes").find((q) => q.id === sentQuote?.id)).toMatchObject({ status: "accepted" })
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "accepted" })
    expect(store.rows("bookings")[0].accepted_at).toBeTruthy()

    // 4. Deposit invoice from the accepted quote (25% of 1000)
    const depositRes = await createDepositInvoice(
      jsonRequest("http://localhost/api/invoices/deposit", { jobId: BOOKING_ID, depositPercentage: 25 }),
    )
    expect(depositRes.status).toBe(200)
    expect(store.rows("invoices")[0]).toMatchObject({ kind: "deposit", amount: 250 })
    expect(store.rows("documents").some((d) => d.kind === "invoice_pdf")).toBe(true)

    // 5. Record the deposit payment -> deposit_paid derived, balance reduced, deposit invoice marked paid
    const depositPaymentRes = await recordPayment(
      jsonRequest("http://localhost/api/payments", {
        bookingId: BOOKING_ID,
        amount: 250,
        paymentDate: "2026-06-01T10:00:00.000Z",
        method: "eft",
        reference: "DEP-001",
      }),
    )
    expect(depositPaymentRes.status).toBe(200)
    expect(store.rows("bookings")[0]).toMatchObject({ deposit_paid: true, invoice_balance: 750 })
    expect(store.rows("invoices")[0]).toMatchObject({ status: "paid" })

    // Pipeline: accepted -> deposit_paid
    await movePipeline(mock, "deposit_paid", { createInvoiceCorrespondence: true })
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "deposit_paid" })

    // 6. Record the final payment -> balance reaches zero
    const finalPaymentRes = await recordPayment(
      jsonRequest("http://localhost/api/payments", {
        bookingId: BOOKING_ID,
        amount: 750,
        paymentDate: "2026-06-05T10:00:00.000Z",
        method: "eft",
        reference: "FIN-001",
      }),
    )
    expect(finalPaymentRes.status).toBe(200)
    const balance = await calculateInvoiceBalance(mock.supabase as never, BOOKING_ID)
    expect(balance).toMatchObject({ quoteTotal: 1000, totalPaid: 1000, balance: 0 })

    // Payment-received confirmation clears the final_invoice_correspondence gate.
    await mock.supabase.from("correspondences").insert({
      booking_id: BOOKING_ID,
      kind: "payment_received",
      subject: "Payment received — BT-2026-0001",
      status: "sent",
    })

    // Pipeline: deposit_paid -> final_paid
    await movePipeline(mock, "final_paid", { finalPaymentReceived: true })
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "final_paid", invoice_balance: 0 })

    // 7. Voucher readiness gate passes once the balance is zero
    expect(
      checkVoucherReadiness({
        stage: "final_paid",
        invoiceBalance: store.rows("bookings")[0].invoice_balance as number,
        departureDate: DEPARTURE_DATE,
        customerEmail: customer.email as string,
      missingLegReferenceLabels: [],
      }),
    ).toEqual({ ready: true, failures: [] })

    // Simulate voucher generation + send producing a document and correspondence (covered by their own route tests)
    await mock.supabase.from("documents").insert({ booking_id: BOOKING_ID, kind: "voucher_pdf", status: "generated" })
    await mock.supabase.from("correspondences").insert({
      booking_id: BOOKING_ID,
      kind: "voucher",
      subject: "Travel voucher BT-2026-0001",
      status: "sent",
    })

    // 8. Pipeline: final_paid -> voucher_sent updates customer travel dates, then -> closed
    await movePipeline(mock, "voucher_sent")
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "voucher_sent", outcome: "Won" })
    expect(store.rows("documents").find((d) => d.kind === "voucher_pdf")).toMatchObject({ status: "sent" })
    expect(store.rows("customers")[0]).toMatchObject({
      first_travel_date: DEPARTURE_DATE,
      last_travel_date: DEPARTURE_DATE,
    })

    await movePipeline(mock, "closed")
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "closed" })
    expect(store.rows("bookings")[0].closed_at).toBeTruthy()
  })

  it("blocks voucher readiness while an invoice balance remains", () => {
    const result = checkVoucherReadiness({
      stage: "final_paid",
      invoiceBalance: 500,
      departureDate: DEPARTURE_DATE,
      customerEmail: customer.email as string,
    missingLegReferenceLabels: [],
      })

    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "balance_not_zero" }))
  })

  it("blocks quote acceptance when no quote has been sent", () => {
    const failures = validateTransition({
      booking: {
        id: BOOKING_ID,
        stage: "quote_sent",
        source: "web_form",
        reservation_form_received_at: "2026-05-05T00:00:00.000Z",
      },
      customer,
      targetStage: "accepted",
      quotes: [],
    })

    expect(failures.map((failure) => failure.gateId)).toEqual(["quote_sent_or_accepted"])
  })

  it("rejects a payment from an unauthorized role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await recordPayment(
      jsonRequest("http://localhost/api/payments", {
        bookingId: BOOKING_ID,
        amount: 250,
        paymentDate: "2026-06-01T10:00:00.000Z",
        method: "eft",
      }),
    )

    expect(res.status).toBe(403)
  })
})
