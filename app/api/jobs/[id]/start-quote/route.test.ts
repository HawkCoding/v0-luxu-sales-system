import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/quotes/quote-number", () => ({
  buildQuoteNumber: vi.fn(() => "BT-2026-0001-Q1"),
}))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const CUSTOMER_ID = "00000000-0000-4000-8000-00000000bbbb"
const QUOTE_ID = "00000000-0000-4000-8000-00000000cccc"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockOptions {
  booking?: {
    id: string
    booking_number: string
    customer_id: string
    source: string
    email_import_needs_review: boolean
    email_import_review_resolved_at: string | null
  }
  customer?: {
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    country: string | null
  } | null
}

function mockAuth({
  booking = {
    id: BOOKING_ID,
    booking_number: "BT-2026-0001",
    customer_id: CUSTOMER_ID,
    source: "web_form",
    email_import_needs_review: false,
    email_import_review_resolved_at: null,
  },
  customer = {
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    phone: "+27110000000",
    country: "South Africa",
  },
}: MockOptions = {}) {
  const quoteInsertPayload = vi.fn()
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: booking, error: null })),
            })),
          })),
        }
      }
      if (table === "customers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: customer, error: null })),
            })),
          })),
        }
      }
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
          insert: vi.fn((payload: unknown) => {
            quoteInsertPayload(payload)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: QUOTE_ID,
                    quote_number: "BT-2026-0001-Q1",
                    status: "draft",
                  },
                  error: null,
                })),
              })),
            }
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
    },
  })

  return { quoteInsertPayload }
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

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 422 when customer fields are missing", async () => {
    mockAuth({ customer: { first_name: "Jane", last_name: "", email: null, phone: null, country: "South Africa" } })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ gateId: "customer_complete" })]),
    )
  })

  it("returns 422 when email import review is unresolved", async () => {
    mockAuth({
      booking: {
        id: BOOKING_ID,
        booking_number: "BT-2026-0001",
        customer_id: CUSTOMER_ID,
        source: "email",
        email_import_needs_review: true,
        email_import_review_resolved_at: null,
      },
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.failures).toEqual(
      expect.arrayContaining([expect.objectContaining({ gateId: "email_import_review" })]),
    )
  })

  it("creates a draft quote for a reviewed email import", async () => {
    const { quoteInsertPayload } = mockAuth({
      booking: {
        id: BOOKING_ID,
        booking_number: "BT-2026-0001",
        customer_id: CUSTOMER_ID,
        source: "email",
        email_import_needs_review: true,
        email_import_review_resolved_at: "2026-05-13T10:00:00.000Z",
      },
    })

    const res = await POST(new Request("http://localhost"), makeParams())

    expect(res.status).toBe(200)
    expect(quoteInsertPayload).toHaveBeenCalledWith(
      expect.objectContaining({ quote_number: "BT-2026-0001-Q1", status: "draft" }),
    )
  })

  it("creates a draft quote when gates pass", async () => {
    const { quoteInsertPayload } = mockAuth()

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    expect(quoteInsertPayload).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", total: 0 }))
    const body = await res.json()
    expect(body.quote).toMatchObject({ id: QUOTE_ID, quote_number: "BT-2026-0001-Q1", status: "draft" })
  })
})
