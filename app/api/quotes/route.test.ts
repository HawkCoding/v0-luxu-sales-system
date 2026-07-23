import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/quotes/quote-number", () => ({
  buildQuoteNumber: vi.fn(() => "BT-2026-0001-Q1"),
}))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const QUOTE_ID = "00000000-0000-4000-8000-00000000dddd"

function buildAuth(validityDays = "14") {
  const lineInsert = vi.fn(async () => ({ error: null }))
  const auditInsert = vi.fn(async () => ({ error: null }))
  const quoteInsertPayload = vi.fn()
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { booking_number: "BT-2026-0001" }, error: null })),
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
                    booking_id: BOOKING_ID,
                    itinerary_id: null,
                    status: "draft",
                    quote_number: "BT-2026-0001-Q1",
                    parent_quote_id: null,
                    validity_until: null,
                    subtotal: 0,
                    total: 0,
                  },
                  error: null,
                })),
              })),
            }
          }),
        }
      }
      if (table === "quote_line_items") {
        return { insert: lineInsert }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { value: validityDays }, error: null })),
            })),
          })),
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

  return { lineInsert, quoteInsertPayload, auditInsert }
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/quotes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/quotes", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when role disallowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when neither bookingId nor jobId is provided", async () => {
    buildAuth()
    const res = await POST(postJson({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Invalid request body")
    expect(body.details).toBeDefined()
  })

  it("creates the quote and inserts line items", async () => {
    const { lineInsert, auditInsert } = buildAuth()
    const res = await POST(
      postJson({
        bookingId: BOOKING_ID,
        lineItems: [{ description: "Suite", qty: 2, unitPrice: 100, total: 200 }],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: QUOTE_ID, quoteNumber: "BT-2026-0001-Q1" })
    expect(lineInsert).toHaveBeenCalled()
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quote_generated", entity_id: QUOTE_ID }),
    )
  })

  it("accepts and forwards status: 'ready'", async () => {
    const { quoteInsertPayload } = buildAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, status: "ready" }))
    expect(res.status).toBe(200)
    expect(quoteInsertPayload).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "ready" }),
    )
  })

  it("computes validity_until from quote_validity_days setting", async () => {
    const { quoteInsertPayload } = buildAuth("21")
    const res = await POST(postJson({ bookingId: BOOKING_ID }))

    expect(res.status).toBe(200)
    const insertedPayload = quoteInsertPayload.mock.calls[0]?.[0] as Record<string, unknown>
    const validityUntil = insertedPayload?.validity_until as string
    const expectedDate = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10)
    expect(validityUntil).toBe(expectedDate)
  })

  it("persists preview line item prices without recalculating them", async () => {
    const { lineInsert } = buildAuth()
    const lineItems = [
      {
        description: "Blue Train - Deluxe Suite - Cape Town to Pretoria - Adult",
        qty: 2,
        unitPrice: 1000,
        total: 2000,
      },
      {
        description: "Harbour Hotel - Sea View Room - Full Board",
        qty: 4,
        unitPrice: 500,
        total: 2000,
      },
    ]

    const res = await POST(postJson({ bookingId: BOOKING_ID, lineItems }))

    expect(res.status).toBe(200)
    expect(lineInsert).toHaveBeenCalledWith([
      {
        quote_id: QUOTE_ID,
        description: lineItems[0].description,
        supplier_description: null,
        qty: 2,
        unit_price: 1000,
        total: 2000,
        sort_order: 0,
        pricing_snapshot: null,
      },
      {
        quote_id: QUOTE_ID,
        description: lineItems[1].description,
        supplier_description: null,
        qty: 4,
        unit_price: 500,
        total: 2000,
        sort_order: 1,
        pricing_snapshot: null,
      },
    ])
  })
})
