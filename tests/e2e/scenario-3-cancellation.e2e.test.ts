import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow, type SupabaseMock } from "@/lib/testing/supabase-mock"

const supabaseMocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

vi.mock("@/lib/role-utils", () => ({
  extractRoleFromJwt: vi.fn(() => null),
}))

import { POST as cancelBooking } from "@/app/api/jobs/[id]/cancel/route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000dd01"
const CUSTOMER_ID = "customer-dd-1"
const REASON_ID = "00000000-0000-0000-aa01-000000000001"
const OTHER_REASON_ID = "00000000-0000-0000-aa01-000000000002"

function jsonRequest(body: unknown) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeParams() {
  return { params: Promise.resolve({ id: BOOKING_ID }) }
}

interface SeedOptions {
  bookingStage?: string
  depositRefundable?: boolean
}

function seedStore({ bookingStage = "deposit_paid", depositRefundable = false }: SeedOptions = {}): SupabaseMock {
  const customer: MockRow = {
    id: CUSTOMER_ID,
    first_name: "Casey",
    last_name: "Customer",
    email: "casey@example.test",
    phone: "+27110000000",
    country: "South Africa",
  }
  const booking: MockRow = {
    id: BOOKING_ID,
    booking_number: "BT-2026-0099",
    customer_id: CUSTOMER_ID,
    consultant: "TA",
    source: "web_form",
    stage: bookingStage,
    outcome: "Open",
    owner_user_id: USER_ID,
    assigned_salesperson_id: USER_ID,
    deposit_paid: true,
    invoice_balance: 0,
    updated_at: "2026-05-01T00:00:00.000Z",
  }
  const acceptedQuote: MockRow = {
    id: "quote-acc-1",
    booking_id: BOOKING_ID,
    status: "accepted",
    total: 80000,
    created_at: "2026-05-02T00:00:00.000Z",
  }
  const depositInvoice: MockRow = {
    id: "inv-dep-1",
    booking_id: BOOKING_ID,
    kind: "deposit",
    amount: 20000,
    status: "paid",
    created_at: "2026-05-03T00:00:00.000Z",
  }
  const finalInvoice: MockRow = {
    id: "inv-fin-1",
    booking_id: BOOKING_ID,
    kind: "final",
    amount: 60000,
    status: "paid",
    created_at: "2026-05-04T00:00:00.000Z",
  }
  const profile: MockRow = {
    id: "profile-1",
    user_id: USER_ID,
    name: "Casey",
    surname: "Consultant",
    email: "casey.consultant@example.test",
    clearance_level: "consultant",
    is_active: true,
  }
  const reason: MockRow = {
    id: REASON_ID,
    label: "Customer cancelled",
    applies_to: "Cancelled",
    active: true,
  }
  const otherReason: MockRow = {
    id: OTHER_REASON_ID,
    label: "Other",
    applies_to: "Cancelled",
    active: true,
  }
  const depositSetting: MockRow = {
    key: "deposit_refundable",
    value: depositRefundable ? "true" : "false",
  }

  return createSupabaseMock({
    customers: [customer],
    bookings: [booking],
    profiles: [profile],
    quotes: [acceptedQuote],
    invoices: [depositInvoice, finalInvoice],
    payments: [
      { id: "pay-dep", booking_id: BOOKING_ID, amount: 20000, payment_kind: "payment" },
      { id: "pay-fin", booking_id: BOOKING_ID, amount: 60000, payment_kind: "payment" },
    ],
    outcome_reasons: [reason, otherReason],
    app_settings: [depositSetting],
    audit_logs: [],
    pipeline_history: [],
  })
}

function mockSession(mock: SupabaseMock) {
  const supabase = mock.supabase as unknown as {
    auth: { getUser: () => Promise<{ data: { user: { id: string; email: string } | null }; error: null }> }
  }
  supabase.auth = {
    getUser: async () => ({ data: { user: { id: USER_ID, email: "casey.consultant@example.test" } }, error: null }),
  }
  supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)
}

describe("E2E Scenario 3: Cancellation + refund (forfeit deposit)", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("auto-calculates a forfeit-deposit refund, writes a negative payment row, marks Cancelled, and audits", async () => {
    const mock = seedStore()
    const { store } = mock
    mockSession(mock)

    const res = await cancelBooking(
      jsonRequest({
        outcomeReasonId: REASON_ID,
        refundStatus: "refunded",
        refundReference: "REF-CANCEL-001",
        refundedAt: "2026-05-20",
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Booking marked Cancelled with refund metadata.
    const booking = store.rows("bookings")[0]
    expect(booking).toMatchObject({
      stage: "lost",
      outcome: "Cancelled",
      outcome_reason_id: REASON_ID,
      refund_status: "refunded",
      refund_reference: "REF-CANCEL-001",
      refunded_at: "2026-05-20",
    })

    // Forfeit-deposit rule: cancellation fee = deposit (20000), refund = total paid (80000) − 20000 = 60000.
    expect(Number(booking.refund_amount)).toBe(60000)

    // Negative payment row inserted with refund kind.
    const refundPayments = store.rows("payments").filter((p) => p.payment_kind === "refund")
    expect(refundPayments).toHaveLength(1)
    expect(Number(refundPayments[0].amount)).toBe(-60000)
    expect(refundPayments[0]).toMatchObject({ booking_id: BOOKING_ID, captured_by: USER_ID })

    // Pipeline history row written.
    expect(store.rows("pipeline_history").some((p) => p.from_stage === "deposit_paid" && p.to_stage === "lost")).toBe(true)

    // Audit log captures the cancellation with cancellation_fee + refund_amount in the after payload.
    const auditRow = store.rows("audit_logs").find((a) => a.action === "booking_cancelled")
    expect(auditRow).toBeTruthy()
    const after = auditRow?.after_json as Record<string, unknown>
    expect(after).toMatchObject({
      stage: "lost",
      outcome: "Cancelled",
      outcome_reason: "Customer cancelled",
      refund_status: "refunded",
      cancellation_fee: 20000,
      refund_amount: 60000,
    })
  })

  it("refunds the full amount when deposit_refundable is true", async () => {
    const mock = seedStore({ depositRefundable: true })
    const { store } = mock
    mockSession(mock)

    const res = await cancelBooking(
      jsonRequest({ outcomeReasonId: REASON_ID, refundStatus: "refunded" }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const booking = store.rows("bookings")[0]
    expect(Number(booking.refund_amount)).toBe(80000)
    const auditRow = store.rows("audit_logs").find((a) => a.action === "booking_cancelled")
    const after = auditRow?.after_json as Record<string, unknown>
    expect(after).toMatchObject({ cancellation_fee: 0, refund_amount: 80000 })
  })

  it("requires an outcome reason (returns 400)", async () => {
    const mock = seedStore()
    mockSession(mock)

    const res = await cancelBooking(jsonRequest({}), makeParams())
    expect(res.status).toBe(400)
  })

  it("requires notes when the reason is 'Other'", async () => {
    const mock = seedStore()
    mockSession(mock)

    const res = await cancelBooking(
      jsonRequest({ outcomeReasonId: OTHER_REASON_ID, refundStatus: "not_refunded" }),
      makeParams(),
    )
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Notes are required/i)
  })
})
