import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow, type SupabaseMock } from "@/lib/testing/supabase-mock"
import { parseEmailDraft } from "@/lib/import/parseEmailDraft"
import { validateTransition, type ManualConfirmations } from "@/lib/pipeline/validate-transition"
import { applyTransition } from "@/lib/pipeline/apply-transition"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"
import { COMPLETED_REPEAT_BOOKING_STAGES } from "@/lib/customer-repeat-status"
import type { PipelineStage } from "@/lib/types"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

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
const BOOKING_ID = "00000000-0000-4000-8000-00000000cc01"
const REPEAT_BOOKING_ID = "00000000-0000-4000-8000-00000000cc02"
const CUSTOMER_ID = "customer-rr-1"
const DEPARTURE_DATE = "2026-10-04"

const ROVOS_FIXTURE = `Hello team,

Please quote Rovos Rail for myself and my wife.
Route: Pretoria to Cape Town
Departure: 2026-10-04
We would like 1 Royal Double Suite for 2 adults.
Contact me on +27 82 555 4242 or john.smith@example.com.

Regards,
John Smith
`

function jsonRequest(url: string, body: unknown = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function mockAuth(supabase: unknown) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "consultant@example.test" },
      profile: { clearanceLevel: "consultant", actorName: "Test Actor", isActive: true, name: "Test", surname: "Actor", email: "consultant@example.test" },
    },
  })
}

function seedFromParsedRovos(): SupabaseMock {
  const parsed = parseEmailDraft(ROVOS_FIXTURE)
  const customer: MockRow = {
    id: CUSTOMER_ID,
    first_name: parsed.customer.firstName,
    last_name: parsed.customer.surname,
    email: parsed.customer.email,
    phone: parsed.customer.phone,
    country: "South Africa",
    first_travel_date: null,
    last_travel_date: null,
  }
  const booking: MockRow = {
    id: BOOKING_ID,
    booking_number: "RR-2026-0001",
    customer_id: CUSTOMER_ID,
    consultant: "TA",
    source: "email",
    stage: "enquiry",
    email_import_needs_review: false,
    email_import_review_resolved_at: "2026-05-01T00:00:00.000Z",
    departure_date: parsed.trip.departureDate,
    deposit_paid: false,
    invoice_balance: null,
    raw_text: parsed.rawText,
    is_repeat_client_at_creation: false,
    updated_at: "2026-05-01T00:00:00.000Z",
  }
  return createSupabaseMock({
    customers: [customer],
    bookings: [booking],
    quotes: [],
    invoices: [],
    payments: [],
    documents: [],
    correspondences: [],
    audit_logs: [],
    app_settings: [],
  })
}

async function moveStage(mock: SupabaseMock, targetStage: PipelineStage, manualConfirmations?: ManualConfirmations) {
  const booking = mock.store.rows("bookings").find((b) => b.id === BOOKING_ID)!
  const customer = mock.store.rows("customers").find((c) => c.id === CUSTOMER_ID)!
  const quotes = mock.store.rows("quotes")
    .filter((q) => q.booking_id === BOOKING_ID)
    .map((q) => ({ id: q.id as string, status: q.status as string, total: q.total as number, created_at: q.created_at as string }))
  const documents = mock.store.rows("documents")
    .filter((d) => d.booking_id === BOOKING_ID)
    .map((d) => ({ id: d.id as string, kind: d.kind as string, status: d.status as string }))
  const correspondences = mock.store.rows("correspondences")
    .filter((c) => c.booking_id === BOOKING_ID)
    .map((c) => ({ id: c.id as string, kind: c.kind as string, subject: c.subject as string, status: c.status as string }))

  const failures = validateTransition({
    booking: {
      id: booking.id as string,
      stage: booking.stage as PipelineStage,
      source: booking.source as string,
      email_import_needs_review: booking.email_import_needs_review as boolean,
      email_import_review_resolved_at: booking.email_import_review_resolved_at as string | null,
    },
    customer,
    targetStage,
    quotes,
    documents,
    correspondences,
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
    durationNights: 4,
    targetStage,
    actorName: "Test Actor",
    actorUserId: USER_ID,
    quotes: quotes as ApplyInput["quotes"],
    documents: documents as ApplyInput["documents"],
    correspondences: correspondences as ApplyInput["correspondences"],
    manualConfirmations,
    now: new Date("2026-07-01T10:00:00.000Z"),
  })
}

describe("E2E Scenario 2: Rovos Rail enquiry → voucher", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("drives a Rovos booking through quote, payments, voucher generation and voucher sent", async () => {
    // 1. Parse Rovos enquiry — fields the importer would extract.
    const parsed = parseEmailDraft(ROVOS_FIXTURE)
    expect(parsed.trip.supplier).toBe("Rovos Rail")
    expect(parsed.trip.route).toBe("Pretoria To Cape Town")
    expect(parsed.trip.departureDate).toBe(DEPARTURE_DATE)
    expect(parsed.customer.email).toBe("john.smith@example.com")
    expect(parsed.guests.adults).toBe(2)

    const mock = seedFromParsedRovos()
    const { store } = mock
    mockAuth(mock.supabase)

    // 2. Booking was created with RR-#### number.
    expect(store.rows("bookings")[0].booking_number).toBe("RR-2026-0001")

    // 3. Start + send the quote.
    await startQuote(jsonRequest(`http://localhost/api/jobs/${BOOKING_ID}/start-quote`), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    expect(store.rows("quotes")[0]).toMatchObject({ quote_number: "RR-2026-0001-Q1", status: "draft" })

    await createQuote(jsonRequest("http://localhost/api/quotes", {
      bookingId: BOOKING_ID,
      status: "sent",
      total: 80000,
    }))
    const sentQuote = store.rows("quotes").find((q) => q.status === "sent")
    expect(sentQuote).toMatchObject({ quote_number: "RR-2026-0001-Q2", total: 80000 })

    // 4. Pipeline: enquiry → quote_sent → accepted.
    await moveStage(mock, "quote_sent")
    await moveStage(mock, "accepted")
    expect(store.rows("bookings")[0].stage).toBe("accepted")

    // 5. Deposit invoice generated + paid.
    await createDepositInvoice(jsonRequest("http://localhost/api/invoices/deposit", {
      jobId: BOOKING_ID,
      depositPercentage: 25,
    }))
    expect(store.rows("invoices")[0]).toMatchObject({ kind: "deposit", amount: 20000 })

    await recordPayment(jsonRequest("http://localhost/api/payments", {
      bookingId: BOOKING_ID,
      amount: 20000,
      paymentDate: "2026-07-02T10:00:00.000Z",
      method: "eft",
      reference: "DEP-RR-001",
    }))
    expect(store.rows("bookings")[0]).toMatchObject({ deposit_paid: true, invoice_balance: 60000 })

    await moveStage(mock, "deposit_paid", { createInvoiceCorrespondence: true, depositReceived: true })
    expect(store.rows("bookings")[0].stage).toBe("deposit_paid")

    // 6. Final invoice + final payment → balance to zero.
    await recordPayment(jsonRequest("http://localhost/api/payments", {
      bookingId: BOOKING_ID,
      amount: 60000,
      paymentDate: "2026-07-05T10:00:00.000Z",
      method: "eft",
      reference: "FIN-RR-001",
    }))
    await moveStage(mock, "final_paid", { createFinalInvoice: true, finalPaymentReceived: true })
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "final_paid", invoice_balance: 0 })

    // 7. Voucher readiness gate passes.
    const customer = store.rows("customers")[0]
    expect(
      checkVoucherReadiness({
        stage: "final_paid",
        invoiceBalance: store.rows("bookings")[0].invoice_balance as number,
        departureDate: DEPARTURE_DATE,
        customerEmail: customer.email as string,
      }),
    ).toEqual({ ready: true, failures: [] })

    // 8. Voucher generation + send: modular voucher block + PDF + correspondence.
    //    (The voucher-send route itself is covered by app/api/vouchers/[id]/send/route.test.ts.
    //     Here we simulate its side-effects to keep this E2E off the storage backend.)
    await mock.supabase.from("vouchers").insert({
      booking_id: BOOKING_ID,
      voucher_number: "RR-2026-0001-V1",
    })
    await mock.supabase.from("voucher_service_blocks").insert({
      booking_id: BOOKING_ID,
      service_type: "train",
      service_label: "Rovos Rail · Pretoria → Cape Town",
      sort_order: 1,
    })
    await mock.supabase.from("documents").insert({
      booking_id: BOOKING_ID,
      kind: "voucher_pdf",
      status: "generated",
      storage_path: "vouchers/RR-2026-0001-V1.pdf",
    })
    await mock.supabase.from("correspondences").insert({
      booking_id: BOOKING_ID,
      kind: "voucher",
      subject: "Travel voucher RR-2026-0001",
      status: "sent",
    })

    // 9. Pipeline → voucher_sent: updates customer travel dates + flips outcome=Won + marks doc sent.
    await moveStage(mock, "voucher_sent")
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "voucher_sent", outcome: "Won" })
    expect(store.rows("documents").find((d) => d.kind === "voucher_pdf")).toMatchObject({ status: "sent" })
    expect(store.rows("customers")[0]).toMatchObject({
      first_travel_date: DEPARTURE_DATE,
      last_travel_date: DEPARTURE_DATE,
    })
    expect(store.rows("voucher_service_blocks")).toHaveLength(1)
    expect(store.rows("voucher_service_blocks")[0]).toMatchObject({ service_type: "train" })

    // 10. Booking reaches Closed.
    await moveStage(mock, "closed")
    expect(store.rows("bookings")[0]).toMatchObject({ stage: "closed" })

    // 11. Repeat-client rule: a future enquiry from the same customer is flagged as repeat.
    //     The importer queries bookings.stage in COMPLETED_REPEAT_BOOKING_STAGES — assert that
    //     the closed RR-#### booking now satisfies the query.
    const { data: priorCompleted } = await mock.supabase
      .from("bookings")
      .select("id")
      .eq("customer_id", CUSTOMER_ID)
      .in("stage", COMPLETED_REPEAT_BOOKING_STAGES)
      .limit(1)
    const isRepeat = (priorCompleted as Array<{ id: string }> | null ?? []).length > 0
    expect(isRepeat).toBe(true)

    // Simulate the importer creating a follow-up booking flagged as repeat client.
    await mock.supabase.from("bookings").insert({
      id: REPEAT_BOOKING_ID,
      booking_number: "RR-2026-0002",
      customer_id: CUSTOMER_ID,
      consultant: "TA",
      source: "email",
      stage: "enquiry",
      is_repeat_client_at_creation: isRepeat,
      updated_at: "2026-08-01T00:00:00.000Z",
    })
    expect(store.rows("bookings").find((b) => b.id === REPEAT_BOOKING_ID))
      .toMatchObject({ is_repeat_client_at_creation: true })
  })
})
