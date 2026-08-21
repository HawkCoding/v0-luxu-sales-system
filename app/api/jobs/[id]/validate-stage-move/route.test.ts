import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"

const supabaseMocks = vi.hoisted(() => ({ createSessionClient: vi.fn() }))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { POST } from "./route"

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

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}/validate-stage-move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

type MutableAuth = { getUser: () => Promise<{ data: { user: { id: string; email: string } | null }; error: unknown }> }

function createSupabase(bookingOverrides: MockRow) {
  const mock = createSupabaseMock({
    bookings: [
      {
        id: BOOKING_ID,
        stage: "lost",
        customer_id: CUSTOMER_ID,
        source: "web_form",
        email_import_needs_review: false,
        email_import_review_resolved_at: null,
        reservation_form_received_at: null,
        revision_reset_at: null,
        customer_invoice_number: null,
        ...bookingOverrides,
      },
    ],
    customers: [{ ...customer }],
    quotes: [],
    documents: [],
    invoices: [],
    correspondences: [],
    payments: [],
  })
  ;(mock.supabase.auth as MutableAuth).getUser = async () => ({
    data: { user: { id: USER_ID, email: "leonie@example.test" } },
    error: null,
  })
  return mock
}

describe("POST /api/jobs/[id]/validate-stage-move — terminal-state parity with PATCH (F12-4)", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("reports a block, not-overridable, for a move off a cancelled booking", async () => {
    const mock = createSupabase({ stage: "lost" })
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await POST(makeRequest({ targetStage: "enquiry" }), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    const body = (await res.json()) as { failures: Array<{ gateId: string; severity: string }>; canOverride: boolean }

    expect(res.status).toBe(200)
    expect(body.canOverride).toBe(false)
    expect(body.failures).toHaveLength(1)
    expect(body.failures[0]).toMatchObject({ gateId: "terminal_stage", severity: "block" })
  })

  it("reports a block for a move off a closed booking", async () => {
    const mock = createSupabase({ stage: "closed" })
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await POST(makeRequest({ targetStage: "voucher_sent" }), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    const body = (await res.json()) as { failures: Array<{ message: string }> }

    expect(body.failures[0].message).toMatch(/closed/)
  })

  it("leaves a non-terminal booking's dry run untouched", async () => {
    const mock = createSupabase({ stage: "enquiry" })
    supabaseMocks.createSessionClient.mockResolvedValue(mock.supabase)

    const res = await POST(makeRequest({ targetStage: "quote_sent" }), {
      params: Promise.resolve({ id: BOOKING_ID }),
    })
    const body = (await res.json()) as { failures: Array<{ gateId: string }> }

    // Real gates still apply (no sent quote here) — just confirms the new
    // terminal guard doesn't fire for an ordinary in-ladder booking.
    expect(body.failures.some((f) => f.gateId === "terminal_stage")).toBe(false)
  })
})
