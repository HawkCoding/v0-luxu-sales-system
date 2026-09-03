import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow, type SupabaseMock } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const emailMocks = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ success: true, error: null, providerMessageId: "msg-1" })),
  isFallbackSendingUnavailable: vi.fn(() => false),
  resolveSalespersonSender: vi.fn(async () => ({
    salespersonCredentialId: "cred-1",
    fromAddress: "consultant@example.test",
    reason: "ok" as const,
  })),
  getEmailFromAddress: vi.fn(async () => "office@example.test"),
}))

const transitionMocks = vi.hoisted(() => ({
  // Returns the shape the caller actually reads — the transition result is now used to record the
  // move (pipeline_history, audit), not fired and forgotten.
  applyTransition: vi.fn(async () => ({
    updated: { id: "booking-1", stage: "accepted", updated_at: "2026-05-01T00:00:00.000Z" },
    crossedStages: ["accepted"],
  })),
}))

vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

vi.mock("@/lib/email/transport", () => ({
  sendEmail: emailMocks.sendEmail,
  isFallbackSendingUnavailable: emailMocks.isFallbackSendingUnavailable,
}))

vi.mock("@/lib/email/resolve-sender", () => ({
  resolveSalespersonSender: emailMocks.resolveSalespersonSender,
}))

vi.mock("@/lib/email/from", () => ({ getEmailFromAddress: emailMocks.getEmailFromAddress }))

vi.mock("@/lib/pipeline/apply-transition", () => ({
  applyTransition: transitionMocks.applyTransition,
  StaleTransitionError: class StaleTransitionError extends Error {
    currentUpdatedAt = "2026-05-01T00:00:00.000Z"
  },
}))

vi.mock("@/lib/audit-write", () => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))

import { POST as sendCorrespondence } from "@/app/api/correspondence/route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

const customer: MockRow = {
  id: "customer-1",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.test",
  phone: "+27110000000",
  country: "South Africa",
}

function seedStore(quotes: MockRow[]): SupabaseMock {
  return createSupabaseMock({
    customers: [{ ...customer }],
    bookings: [
      {
        id: BOOKING_ID,
        booking_number: "LTT-2026-0001",
        customer_id: "customer-1",
        consultant: "LB",
        source: "web_form",
        stage: "quote_sent",
        email_import_needs_review: false,
        email_import_review_resolved_at: null,
        reservation_form_received_at: null,
        customer_invoice_number: "LTT-2026-0001-INV",
        assigned_salesperson_id: USER_ID,
        departure_date: "2026-08-01",
        duration_nights: 3,
        invoice_balance: null,
        raw_text: null,
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ],
    quotes,
    invoices: [],
    payments: [],
    documents: [],
    correspondences: [],
    pipeline_history: [],
    audit_logs: [],
    app_settings: [],
  })
}

function mockAuthOk(supabase: unknown) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "user@example.test" },
      profile: { clearanceLevel: "consultant", actorName: "Leonie" },
    },
  })
}

function reservationSendRequest() {
  return new Request("http://localhost/api/correspondence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookingId: BOOKING_ID,
      kind: "reservation_received",
      subject: "Reservation form received",
      bodyHtml: "<p>Thank you for your reservation form well received.</p>",
      moveStage: "accepted",
    }),
  })
}

describe("POST /api/correspondence pre-send gates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    emailMocks.sendEmail.mockResolvedValue({ success: true, error: null, providerMessageId: "msg-1" })
    emailMocks.isFallbackSendingUnavailable.mockReturnValue(false)
    emailMocks.resolveSalespersonSender.mockResolvedValue({
      salespersonCredentialId: "cred-1",
      fromAddress: "consultant@example.test",
      reason: "ok" as const,
    })
  })

  // Regression: the gate check ran without loading the booking's quotes, so
  // `quote_sent_or_accepted` saw an empty array and blocked every
  // reservation-form acknowledgement on a booking that plainly had a sent quote.
  it("sends the reservation acknowledgement when a sent quote exists", async () => {
    const mock = seedStore([
      { id: "quote-1", booking_id: BOOKING_ID, status: "sent", total: 1000, created_at: "2026-05-02T00:00:00.000Z" },
    ])
    mockAuthOk(mock.supabase)

    const res = await sendCorrespondence(reservationSendRequest())

    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(transitionMocks.applyTransition).toHaveBeenCalledTimes(1)
  })

  it("blocks the send when the booking has no sent or accepted quote", async () => {
    const mock = seedStore([
      { id: "quote-1", booking_id: BOOKING_ID, status: "draft", total: 1000, created_at: "2026-05-02T00:00:00.000Z" },
    ])
    mockAuthOk(mock.supabase)

    const res = await sendCorrespondence(reservationSendRequest())
    const body = (await res.json()) as { error: string; details?: { failures?: Array<{ gateId: string }> } }

    expect(res.status).toBe(400)
    expect(body.error).toBe("Stage transition blocked")
    expect(body.details?.failures?.map((failure) => failure.gateId)).toContain("quote_sent_or_accepted")
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })

  it("blocks the send when the customer record is incomplete", async () => {
    const mock = seedStore([
      { id: "quote-1", booking_id: BOOKING_ID, status: "sent", total: 1000, created_at: "2026-05-02T00:00:00.000Z" },
    ])
    mock.store.tables.customers[0].phone = null
    mockAuthOk(mock.supabase)

    const res = await sendCorrespondence(reservationSendRequest())
    const body = (await res.json()) as { error: string; details?: { failures?: Array<{ gateId: string }> } }

    expect(res.status).toBe(400)
    expect(body.details?.failures?.map((failure) => failure.gateId)).toEqual(["customer_complete"])
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
  })
})

// The gate system was advisory: PATCH /api/jobs/[id] correctly refused `deposit_paid` with no
// payment recorded, and the identical move went straight through this route one call later, because
// it only gated three target stages against five gate ids and never loaded `payments` at all.
describe("POST /api/correspondence stage gates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    emailMocks.sendEmail.mockResolvedValue({ success: true, error: null, providerMessageId: "msg-1" })
    emailMocks.isFallbackSendingUnavailable.mockReturnValue(false)
    emailMocks.resolveSalespersonSender.mockResolvedValue({
      salespersonCredentialId: "cred-1",
      fromAddress: "consultant@example.test",
      reason: "ok" as const,
    })
  })

  function depositPaidRequest() {
    return new Request("http://localhost/api/correspondence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: BOOKING_ID,
        kind: "payment_received",
        subject: "Deposit received",
        bodyHtml: "<p>Thank you, your deposit is received.</p>",
        moveStage: "deposit_paid",
      }),
    })
  }

  it("refuses to mark the deposit paid when no payment is on file, and sends nothing", async () => {
    const mock = seedStore([
      { id: "quote-1", booking_id: BOOKING_ID, status: "accepted", total: 1000, created_at: "2026-05-02T00:00:00.000Z" },
    ])
    mockAuthOk(mock.supabase)

    const res = await sendCorrespondence(depositPaidRequest())
    const body = (await res.json()) as { error: string; details?: { failures?: Array<{ gateId: string }> } }

    expect(res.status).toBe(400)
    expect(body.details?.failures?.map((failure) => failure.gateId)).toContain("deposit_received_confirmation")
    // A payment is not something an email can conjure, so the block lands before the send.
    expect(emailMocks.sendEmail).not.toHaveBeenCalled()
    expect(transitionMocks.applyTransition).not.toHaveBeenCalled()
    expect(mock.store.rows("bookings")[0].stage).toBe("quote_sent")
  })

  it("allows the same move once a payment exists", async () => {
    const mock = seedStore([
      { id: "quote-1", booking_id: BOOKING_ID, status: "accepted", total: 1000, created_at: "2026-05-02T00:00:00.000Z" },
    ])
    // Everything the ladder demands on the way to deposit_paid, since crossing a stage means
    // clearing every gate between here and there — not just the target's own.
    mock.store.tables.bookings[0].reservation_form_received_at = "2026-05-02T00:00:00.000Z"
    mock.store.tables.payments.push({ id: "pay-1", booking_id: BOOKING_ID, amount: 250 })
    mock.store.tables.invoices.push({ id: "inv-1", booking_id: BOOKING_ID, kind: "deposit", status: "sent" })
    mock.store.tables.correspondences.push({
      id: "cor-existing",
      booking_id: BOOKING_ID,
      kind: "invoice",
      subject: "Your deposit invoice",
      status: "sent",
      created_at: "2026-05-03T00:00:00.000Z",
    })
    mockAuthOk(mock.supabase)

    const res = await sendCorrespondence(depositPaidRequest())

    expect(res.status).toBe(200)
    expect(emailMocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(transitionMocks.applyTransition).toHaveBeenCalledTimes(1)
  })
})
