import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

import { PATCH } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-000000000002"
const UPDATED_AT = "2026-09-15T00:00:00.000Z"

interface LineItemRow {
  description: string
  supplier_description: string | null
  qty: number
  unit_price: number
  total: number
  sort_order: number
  pricing_snapshot: Record<string, unknown> | null
}

function buildSupabase(
  lineItems: LineItemRow[],
  options: { commissionBonus?: number; agentCommission?: number; discountAmount?: number; adults?: number; children?: number } = {},
) {
  const rpc = vi.fn(async () => ({ error: null }))
  const quoteUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

  const supabase = {
    rpc,
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: QUOTE_ID,
                  booking_id: BOOKING_ID,
                  status: "draft",
                  subtotal: 2000,
                  total: 2000,
                  commission_bonus: options.commissionBonus ?? 0,
                  agent_commission: options.agentCommission ?? 0,
                  discount_amount: options.discountAmount ?? 0,
                  updated_at: UPDATED_AT,
                  booking: [{ no_of_adults: options.adults ?? 2, no_of_children: options.children ?? 0 }],
                },
                error: null,
              })),
            })),
          })),
          update: quoteUpdate,
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: lineItems, error: null })),
            })),
          })),
        }
      }
      if (table === "audit_logs") {
        return { insert: vi.fn(async () => ({ error: null })) }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, rpc, quoteUpdate }
}

function patchReq(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}/commission`, {
    method: "PATCH",
    body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT, ...body }),
    headers: { "Content-Type": "application/json" },
  })
}

const routeParams = { params: Promise.resolve({ id: QUOTE_ID }) }

const travelLine: LineItemRow = {
  description: "Blue Train — Pretoria to Cape Town",
  supplier_description: null,
  qty: 1,
  unit_price: 2000,
  total: 2000,
  sort_order: 0,
  pricing_snapshot: { source: "pricing_engine", pricingMode: "rate_card" },
}

describe("PATCH /api/quotes/[id]/commission", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  function authorise(
    lineItems: LineItemRow[],
    options?: Parameters<typeof buildSupabase>[1],
  ) {
    const built = buildSupabase(lineItems, options)
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: built.supabase,
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    return built
  }

  it("adds a new Commission line when the quote has none yet", async () => {
    const { rpc } = authorise([travelLine])

    const res = await PATCH(patchReq({ type: "percent", value: 10 }), routeParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    const commissionLine = (body.lineItems as { description: string; total: number }[]).find(
      (li) => li.description === "Commission",
    )
    expect(commissionLine?.total).toBe(200)
    expect(body.subtotal).toBe(2200)
  })

  it("recomputes an existing Commission line's amount off the other lines' subtotal", async () => {
    const existingCommission: LineItemRow = {
      description: "Commission",
      supplier_description: null,
      qty: 1,
      unit_price: 200,
      total: 200,
      sort_order: 1,
      pricing_snapshot: {
        source: "pricing_engine",
        pricingMode: "rate_card",
        commission: { type: "percent", value: 10, amount: 200, source: "line", passengerCount: 2 },
      },
    }
    const { rpc } = authorise([travelLine, existingCommission])

    const res = await PATCH(patchReq({ type: "percent", value: 20 }), routeParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    const commissionLine = (body.lineItems as { description: string; total: number }[]).find(
      (li) => li.description === "Commission",
    )
    // 20% of the 2000 travel line, not of 2000 + the old 200 commission line.
    expect(commissionLine?.total).toBe(400)
  })

  it("falls back to the booking headcount for per_person when no passengerCount is stored yet", async () => {
    authorise([travelLine], { adults: 3, children: 1 })

    const res = await PATCH(patchReq({ type: "per_person", value: 100 }), routeParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    const commissionLine = (body.lineItems as { description: string; total: number }[]).find(
      (li) => li.description === "Commission",
    )
    expect(commissionLine?.total).toBe(400)
  })

  it("re-folds an existing Rounding top-up into the recomputed Commission line", async () => {
    const existingCommission: LineItemRow = {
      description: "Commission",
      supplier_description: null,
      qty: 1,
      unit_price: 250,
      total: 250,
      sort_order: 1,
      pricing_snapshot: {
        source: "pricing_engine",
        pricingMode: "rate_card",
        commission: { type: "percent", value: 10, amount: 200, source: "line", bonus: 50, passengerCount: 2 },
      },
    }
    const { rpc } = authorise([travelLine, existingCommission], { commissionBonus: 50 })

    const res = await PATCH(patchReq({ type: "percent", value: 10 }), routeParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    const commissionLine = (body.lineItems as { description: string; total: number }[]).find(
      (li) => li.description === "Commission",
    )
    // 10% of 2000 = 200, plus the 50 rounding top-up folded back in.
    expect(commissionLine?.total).toBe(250)
  })

  it("refuses to edit a locked quote status", async () => {
    const built = buildSupabase([travelLine])
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: {
          ...built.supabase,
          from: vi.fn((table: string) => {
            if (table === "quotes") {
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    single: vi.fn(async () => ({
                      data: {
                        id: QUOTE_ID,
                        booking_id: BOOKING_ID,
                        status: "accepted",
                        subtotal: 2000,
                        total: 2000,
                        commission_bonus: 0,
                        agent_commission: 0,
                        discount_amount: 0,
                        updated_at: UPDATED_AT,
                        booking: [{ no_of_adults: 2, no_of_children: 0 }],
                      },
                      error: null,
                    })),
                  })),
                })),
              }
            }
            throw new Error(`Unexpected table ${table}`)
          }),
        },
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })

    const res = await PATCH(patchReq({ type: "percent", value: 10 }), routeParams)
    expect(res.status).toBe(409)
  })
})
