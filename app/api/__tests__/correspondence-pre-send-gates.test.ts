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
  applyTransition: vi.fn(async () => undefined),
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
