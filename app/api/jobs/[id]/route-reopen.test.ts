import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"

const supabaseMocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))
vi.mock("@/lib/role-utils", () => ({
  extractRoleFromJwt: vi.fn(() => null),
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const CUSTOMER_ID = "00000000-0000-4000-8000-00000000bbbb"

const customer: MockRow = {
  id: CUSTOMER_ID,
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.test",
  phone: "+27110000000",
  country: "South Africa",
}

const profile: MockRow = {
  user_id: USER_ID,
  clearance_level: "consultant",
  name: "Leonie",
  surname: "Botha",
  email: "leonie@example.test",
  is_active: true,
}

const cancelledBooking: MockRow = {
  id: BOOKING_ID,
  stage: "lost",
  booking_number: "LTT-2026-0099",
  customer_id: CUSTOMER_ID,
  consultant: "LB",
  assigned_salesperson_id: null,
  source: "web_form",
  raw_text: null,
  email_import_needs_review: false,
  email_import_review_resolved_at: null,
  reservation_form_received_at: null,
  revision_reset_at: null,
  updated_at: "2026-08-01T00:00:00.000Z",
  cancelled_at: "2026-08-10T00:00:00.000Z",
  departure_date: null,
  duration_nights: null,
  deposit_paid: false,
  invoice_balance: null,
  no_of_adults: 2,
  no_of_children: 0,
  no_of_suites: 1,
  child_ages: null,
  customer_invoice_number: null,
  outcome: "Cancelled",
  outcome_reason_id: "reason-1",
  outcome_notes: "Client changed plans",
  outcome_set_at: "2026-08-10T00:00:00.000Z",
  outcome_set_by: USER_ID,
  refund_status: "not_refunded",
  refund_amount: null,
  refund_reference: null,
  refunded_at: null,
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** `createSupabaseMock`'s stock `auth.getUser` always returns no user (see
 *  lib/testing/supabase-mock.ts) — every route test that authenticates has to
 *  widen and replace it the same way. */
type MutableAuth = { getUser: () => Promise<{ data: { user: { id: string; email: string } | null }; error: unknown }> }

function createSupabase(bookingOverrides: MockRow = {}) {
  const mock = createSupabaseMock({
    bookings: [{ ...cancelledBooking, ...bookingOverrides }],
    customers: [{ ...customer }],
    profiles: [{ ...profile }],
    quotes: [],
    documents: [],
    invoices: [],
    correspondences: [],
    payments: [],
    pipeline_history: [],
    audit_logs: [],
  })
  ;(mock.supabase.auth as MutableAuth).getUser = async () => ({
    data: { user: { id: USER_ID, email: "leonie@example.test" } },
    error: null,
  })
  return mock
}

describe("PATCH /api/jobs/[id] — lost and closed are permanently terminal (F12-4)", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("blocks any move off a cancelled (`lost`) booking with a dedicated terminal-state message", async () => {
    const mock = createSupabase()
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await PATCH(makeRequest({ stage: "enquiry" }), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    const body = (await res.json()) as { error: string; details?: unknown }

    expect(res.status).toBe(400)
    expect(body.error).toBe("This booking is cancelled and cannot be reopened. Start a new enquiry instead.")
    expect(body.details).toBeUndefined()

    // Nothing was written — the block runs before any gate evaluation or write.
    const untouchedBooking = mock.store.rows("bookings")[0]
    expect(untouchedBooking.stage).toBe("lost")
  })

  it("blocks a move off a closed booking the same way", async () => {
    const mock = createSupabase({ stage: "closed", cancelled_at: null, outcome: "Won" })
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await PATCH(makeRequest({ stage: "voucher_sent" }), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe("This booking is closed and cannot be reopened. Start a new enquiry instead.")
  })

  it("cannot be bypassed with override — the terminal rule is structural, not a gate", async () => {
    const mock = createSupabase()
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await PATCH(
      makeRequest({ stage: "enquiry", override: true, overrideReason: "Manager approved" }),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    )
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(400)
    expect(body.error).toBe("This booking is cancelled and cannot be reopened. Start a new enquiry instead.")

    const untouchedBooking = mock.store.rows("bookings")[0]
    expect(untouchedBooking.stage).toBe("lost")
  })

  it("still allows a same-stage PATCH (no-op) on a cancelled booking", async () => {
    const mock = createSupabase()
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await PATCH(makeRequest({ stage: "lost" }), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })

    expect(res.status).toBe(200)
  })
})
