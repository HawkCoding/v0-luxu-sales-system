import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

import { PATCH } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-000000000001"

interface QuoteFixture {
  status?: string
  subtotal?: number
  total?: number
  agent_commission?: number
  discount_type?: string | null
  discount_value?: number
  discount_amount?: number
  discount_visible?: boolean
  updated_at?: string
}

interface Captured {
  quoteUpdate?: Record<string, unknown>
  auditInsert?: Record<string, unknown>
}

const UPDATED_AT = "2026-09-15T10:00:00.000Z"

function buildSupabase(
  quote: QuoteFixture,
  captured: Captured,
  lineItems: { pricing_snapshot: unknown }[] = [],
) {
  let quoteCallCount = 0
  return {
    from: (table: string) => {
      if (table === "quotes") {
        quoteCallCount += 1
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                if (quoteCallCount > 1) {
                  return { data: { updated_at: UPDATED_AT }, error: null }
                }
                return {
                  data: {
                    id: QUOTE_ID,
                    status: quote.status ?? "draft",
                    subtotal: quote.subtotal ?? 100000,
                    total: quote.total ?? 100000,
                    agent_commission: quote.agent_commission ?? 0,
                    discount_type: quote.discount_type ?? null,
                    discount_value: quote.discount_value ?? 0,
                    discount_amount: quote.discount_amount ?? 0,
                    discount_visible: quote.discount_visible ?? true,
                    updated_at: quote.updated_at ?? UPDATED_AT,
                  },
                  error: null,
                }
              },
            }),
          }),
          update: (row: Record<string, unknown>) => {
            captured.quoteUpdate = row
            return { eq: async () => ({ error: null }) }
          },
        }
      }
      if (table === "quote_line_items") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: lineItems, error: null }),
            }),
          }),
        }
      }
      if (table === "audit_logs") {
        return {
          insert: async (row: Record<string, unknown>) => {
            captured.auditInsert = row
            return { error: null }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function authorise(
  quote: QuoteFixture,
  captured: Captured,
  lineItems: { pricing_snapshot: unknown }[] = [],
) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: buildSupabase(quote, captured, lineItems),
      user: { id: "user-1" },
      profile: { actorName: "Test User", clearanceLevel: "consultant" },
    },
  })
}

async function patch(body: unknown) {
  return PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: QUOTE_ID }),
  })
}

describe("PATCH /api/quotes/[id]/discount", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("saves a fixed discount and nets it off the total", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 100000 }, captured)

    const response = await patch({ type: "fixed", value: 5000, visible: true, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.discountAmount).toBe(5000)
    expect(payload.total).toBe(95000)
    expect(captured.quoteUpdate?.discount_amount).toBe(5000)
    expect(captured.quoteUpdate?.discount_visible).toBe(true)
    expect(captured.quoteUpdate?.total).toBe(95000)
  })

  it("saves a percent discount computed off the subtotal", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 100000 }, captured)

    const response = await patch({ type: "percent", value: 10, visible: true, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.discountAmount).toBe(10000)
    expect(payload.total).toBe(90000)
  })

  it("saves a per_person discount using the Commission line's passengerCount", async () => {
    const captured: Captured = {}
    authorise(
      { status: "draft", subtotal: 100000, total: 100000 },
      captured,
      [{ pricing_snapshot: { commission: { type: "percent", value: 10, amount: 9000, source: "line", passengerCount: 4 } } }],
    )

    const response = await patch({ type: "per_person", value: 500, visible: true, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.discountAmount).toBe(2000)
  })

  it("hides the discount line while still netting it off the total", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 100000 }, captured)

    const response = await patch({ type: "fixed", value: 5000, visible: false, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.total).toBe(95000)
    expect(payload.discountVisible).toBe(false)
    expect(captured.quoteUpdate?.discount_visible).toBe(false)
  })

  it("rejects Agent Commission + Discount exceeding the subtotal", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 10000, total: 8000, agent_commission: 6000 }, captured)

    const response = await patch({ type: "fixed", value: 5000, visible: true, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/together cannot exceed/)
    expect(captured.quoteUpdate).toBeUndefined()
  })

  it("refuses to edit a sent quote", async () => {
    const captured: Captured = {}
    authorise({ status: "sent" }, captured)

    const response = await patch({ type: "fixed", value: 5000, visible: true, expectedUpdatedAt: UPDATED_AT })
    expect(response.status).toBe(409)
    expect(captured.quoteUpdate).toBeUndefined()
  })

  it("rejects a stale version token", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", updated_at: "2026-09-15T09:00:00.000Z" }, captured)

    const response = await patch({ type: "fixed", value: 5000, visible: true, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe("STALE_VERSION")
  })

  it("writes an audit entry with the before/after amounts", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 100000 }, captured)

    await patch({ type: "fixed", value: 5000, visible: true, expectedUpdatedAt: UPDATED_AT })

    expect(captured.auditInsert).toMatchObject({
      action: "quote_discount_changed",
      before_json: { discountAmount: 0, total: 100000 },
      after_json: { discountAmount: 5000, total: 95000 },
    })
  })
})
