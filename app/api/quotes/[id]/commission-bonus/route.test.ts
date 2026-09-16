import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

import { PATCH } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-000000000002"
const UPDATED_AT = "2026-09-01T00:00:00.000Z"

function buildSupabase(existingBonus: number) {
  const rpc = vi.fn(async () => ({ error: null }))
  const bonusUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

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
                  commission_bonus: existingBonus,
                  agent_commission: 0,
                  updated_at: UPDATED_AT,
                },
                error: null,
              })),
            })),
          })),
          update: bonusUpdate,
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    description: "Commission",
                    supplier_description: null,
                    qty: 1,
                    unit_price: 0,
                    total: 0,
                    sort_order: 0,
                    pricing_snapshot: {
                      source: "pricing_engine",
                      pricingMode: "rate_card",
                      commission: { type: "percent", value: 0, amount: 0, source: "line", bonus: existingBonus },
                    },
                  },
                ],
                error: null,
              })),
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

  return { supabase, rpc, bonusUpdate }
}

function patchReq(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}/commission-bonus`, {
    method: "PATCH",
    body: JSON.stringify({ expectedUpdatedAt: UPDATED_AT, ...body }),
    headers: { "Content-Type": "application/json" },
  })
}

const routeParams = { params: Promise.resolve({ id: QUOTE_ID }) }

describe("PATCH /api/quotes/[id]/commission-bonus", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  function authorise(existingBonus: number) {
    const built = buildSupabase(existingBonus)
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

  // Rounding used to allow a negative amount (a discount, before the dedicated discount feature
  // existed) -- but a negative Commission line then fails PATCH /api/quotes/[id]'s nonnegative
  // check, breaking Build Booking's Replace & apply with an opaque error. New saves must reject
  // a negative bonus outright.
  it("rejects a negative bonus", async () => {
    const { rpc } = authorise(0)

    const res = await PATCH(patchReq({ bonus: -500 }), routeParams)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain("negative")
    expect(rpc).not.toHaveBeenCalled()
  })

  it("allows clearing an existing (legacy) negative bonus back to zero", async () => {
    const { rpc, bonusUpdate } = authorise(-46320)

    const res = await PATCH(patchReq({ bonus: 0 }), routeParams)

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    expect(bonusUpdate).toHaveBeenCalledWith({ commission_bonus: 0 })
  })

  it("saves a new positive bonus", async () => {
    const { rpc, bonusUpdate } = authorise(0)

    const res = await PATCH(patchReq({ bonus: 250 }), routeParams)

    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalled()
    expect(bonusUpdate).toHaveBeenCalledWith({ commission_bonus: 250 })
  })
})
