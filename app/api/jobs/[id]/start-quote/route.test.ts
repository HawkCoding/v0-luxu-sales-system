import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

const completeCustomer: MockRow = {
  id: "customer-1",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.test",
  phone: "+27110000000",
  country: "South Africa",
}

const webFormBooking: MockRow = {
  id: BOOKING_ID,
  booking_number: "BT-2026-0001",
  customer_id: "customer-1",
  source: "web_form",
  email_import_needs_review: false,
  email_import_review_resolved_at: null,
}

function routeParams() {
  return { params: Promise.resolve({ id: BOOKING_ID }) }
}

function postRequest() {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}/start-quote`, { method: "POST" })
}

interface SeedOptions {
  booking?: MockRow | null
  customer?: MockRow | null
  existingQuotes?: MockRow[]
}

function seedSupabase(options: SeedOptions = {}) {
  const { booking = webFormBooking, customer = completeCustomer, existingQuotes = [] } = options
  return createSupabaseMock({
    bookings: booking ? [booking] : [],
    customers: customer ? [customer] : [],
    quotes: existingQuotes,
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

describe("POST /api/jobs/[id]/start-quote", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(postRequest(), routeParams())

    expect(res.status).toBe(401)
  })

  it("returns 403 for an insufficient role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(postRequest(), routeParams())

    expect(res.status).toBe(403)
  })

  it("returns 404 when the booking does not exist", async () => {
    const { supabase } = seedSupabase({ booking: null })
    mockAuthOk(supabase)

    const res = await POST(postRequest(), routeParams())

    expect(res.status).toBe(404)
  })

  it("blocks Start Quote when required customer contact fields are incomplete", async () => {
    const { supabase, store } = seedSupabase({
      customer: { ...completeCustomer, phone: null, country: null },
    })
    mockAuthOk(supabase)

    const res = await POST(postRequest(), routeParams())
    const body = (await res.json()) as { failures: Array<{ gateId: string }> }

    expect(res.status).toBe(422)
    expect(body.failures.map((failure) => failure.gateId)).toContain("customer_complete")
    expect(store.rows("quotes")).toHaveLength(0)
  })

  it("blocks Start Quote when an imported enquiry still needs review", async () => {
    const { supabase, store } = seedSupabase({
      booking: {
        ...webFormBooking,
        source: "email",
        email_import_needs_review: true,
        email_import_review_resolved_at: null,
      },
    })
    mockAuthOk(supabase)

    const res = await POST(postRequest(), routeParams())
    const body = (await res.json()) as { failures: Array<{ gateId: string }> }

    expect(res.status).toBe(422)
    expect(body.failures.map((failure) => failure.gateId)).toContain("email_import_review")
    expect(store.rows("quotes")).toHaveLength(0)
  })

  it("creates the first draft quote when all gates pass", async () => {
    const { supabase, store } = seedSupabase()
    mockAuthOk(supabase)

    const res = await POST(postRequest(), routeParams())
    const body = (await res.json()) as { quote: { quote_number: string; status: string } }

    expect(res.status).toBe(200)
    expect(body.quote.quote_number).toBe("BT-2026-0001-Q1")
    expect(body.quote.status).toBe("draft")
    expect(store.rows("quotes")[0]).toEqual(
      expect.objectContaining({ booking_id: BOOKING_ID, status: "draft", total: 0 }),
    )
  })

  it("versions the quote number when earlier quotes already exist", async () => {
    const { supabase } = seedSupabase({
      existingQuotes: [{ id: "q1", booking_id: BOOKING_ID, quote_number: "BT-2026-0001-Q1" }],
    })
    mockAuthOk(supabase)

    const res = await POST(postRequest(), routeParams())
    const body = (await res.json()) as { quote: { quote_number: string } }

    expect(res.status).toBe(200)
    expect(body.quote.quote_number).toBe("BT-2026-0001-Q2")
  })
})
