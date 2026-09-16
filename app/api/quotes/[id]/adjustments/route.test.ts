import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))

vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

import { PATCH } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-000000000002"
const NOW = "2026-09-01T00:00:00.000Z"

interface QuoteFixture {
  status?: string
  commission_bonus?: number
  agent_commission?: number
  discount_type?: string | null
  discount_value?: number
  discount_amount?: number
  updated_at?: string
}

interface Captured {
  rpc?: Record<string, unknown>
  quoteUpdate?: Record<string, unknown>
}

const SERVICE_LINE = {
  description: "Rovos Rail - Golf Safari",
  supplier_description: null,
  qty: 2,
  unit_price: 125_000,
  total: 250_000,
  sort_order: 0,
  pricing_snapshot: null,
}

function buildSupabase(quote: QuoteFixture, captured: Captured) {
  return {
    from: (table: string) => {
      if (table === "quotes") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: QUOTE_ID,
                  booking_id: BOOKING_ID,
                  status: quote.status ?? "draft",
                  subtotal: 250_000,
                  total: 250_000,
                  commission_bonus: quote.commission_bonus ?? 0,
                  agent_commission: quote.agent_commission ?? 0,
                  discount_type: quote.discount_type ?? null,
                  discount_value: quote.discount_value ?? 0,
                  discount_amount: quote.discount_amount ?? 0,
                  discount_visible: true,
                  updated_at: quote.updated_at ?? NOW,
                  booking: { no_of_adults: 2, no_of_children: 0 },
                },
                error: null,
              }),
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
            eq: () => ({ order: async () => ({ data: [SERVICE_LINE], error: null }) }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      captured.rpc = args
      return { error: null }
    },
  }
}

function authorise(quote: QuoteFixture, captured: Captured) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: buildSupabase(quote, captured),
      user: { id: "user-1" },
      profile: { actorName: "Test User", clearanceLevel: "consultant" },
    },
  })
}

function patch(body: unknown) {
  return PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: QUOTE_ID }),
  })
}

const BASE_BODY = {
  commission: null,
  commissionBonus: 0,
  agentCommission: 0,
  discount: null,
  expectedUpdatedAt: NOW,
}

describe("PATCH /api/quotes/[id]/adjustments", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("401s an unauthenticated caller", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const response = await patch(BASE_BODY)
    expect(response.status).toBe(401)
  })

  it("400s an invalid body", async () => {
    const captured: Captured = {}
    authorise({}, captured)
    const response = await patch({ ...BASE_BODY, commissionBonus: -10 })
    expect(response.status).toBe(400)
    expect(captured.rpc).toBeUndefined()
  })

  it("requires expectedUpdatedAt or force", async () => {
    const captured: Captured = {}
    authorise({}, captured)
    const { expectedUpdatedAt: _drop, ...withoutToken } = BASE_BODY
    const response = await patch(withoutToken)
    expect(response.status).toBe(400)
  })

  it("409s a stale write", async () => {
    const captured: Captured = {}
    authorise({ updated_at: "2026-08-01T00:00:00.000Z" }, captured)
    const response = await patch(BASE_BODY)
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.code).toBe("STALE_VERSION")
  })

  it("409s a non-provisional quote", async () => {
    const captured: Captured = {}
    authorise({ status: "sent" }, captured)
    const response = await patch(BASE_BODY)
    expect(response.status).toBe(409)
    expect(captured.rpc).toBeUndefined()
  })

  it("saves Commission, Rounding, Agent Commission and Discount together in one request", async () => {
    const captured: Captured = {}
    authorise({}, captured)

    const response = await patch({
      commission: { type: "percent", value: 10 },
      commissionBonus: 50,
      agentCommission: 1000,
      discount: { type: "percent", value: 5, visible: true },
      expectedUpdatedAt: NOW,
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    // Commission: 10% of 250 000 = 25 000, +50 rounding => subtotal 275 050.
    expect(payload.subtotal).toBe(275_050)
    // Discount resolves against the pre-Rounding subtotal (275 000), not the +50 rounded
    // 275 050 — Rounding is applied last so it never moves the Discount amount.
    // 5% of 275 000 = 13 750.
    expect(payload.discountAmount).toBe(13_750)
    expect(payload.total).toBe(275_050 - 1000 - 13_750)
    expect(captured.quoteUpdate?.agent_commission).toBe(1000)
    expect(captured.quoteUpdate?.discount_amount).toBe(13_750)
    expect(captured.rpc?.p_subtotal).toBe(275_050)
  })

  it("removes the Commission line when commission is sent as null", async () => {
    const captured: Captured = {}
    authorise({}, captured)

    await patch(BASE_BODY)

    const lines = captured.rpc?.p_line_items as Record<string, unknown>[]
    expect(lines).toHaveLength(1)
    expect(lines[0].description).toBe("Rovos Rail - Golf Safari")
  })

  it("blocks a save where Agent Commission and Discount together exceed the subtotal", async () => {
    const captured: Captured = {}
    authorise({}, captured)

    const response = await patch({
      ...BASE_BODY,
      agentCommission: 200_000,
      discount: { type: "fixed", value: 100_000, visible: true },
    })
    expect(response.status).toBe(400)
    expect(captured.rpc).toBeUndefined()
  })

  it("writes a single audit entry naming all four adjustments", async () => {
    const captured: Captured = {}
    authorise({}, captured)

    await patch({
      commission: { type: "fixed", value: 1000 },
      commissionBonus: 0,
      agentCommission: 500,
      discount: null,
      expectedUpdatedAt: NOW,
    })

    expect(auditMocks.writeAuditLog).toHaveBeenCalledTimes(1)
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "quote_adjustments_changed",
        after: expect.objectContaining({ agentCommission: 500 }),
      }),
    )
  })
})
