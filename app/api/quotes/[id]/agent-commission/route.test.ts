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
  updated_at?: string
}

interface Captured {
  quoteUpdate?: Record<string, unknown>
  auditInsert?: Record<string, unknown>
}

const UPDATED_AT = "2026-08-30T10:00:00.000Z"

function buildSupabase(quote: QuoteFixture, captured: Captured) {
  let quoteCallCount = 0
  return {
    from: (table: string) => {
      if (table === "quotes") {
        quoteCallCount += 1
        return {
          select: () => ({
            eq: () => ({
              single: async () => {
                // First select loads the row for the guard checks; the second (after the update)
                // just needs to return the fresh updated_at, mirroring the real route's re-read.
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

async function patch(body: unknown) {
  return PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: QUOTE_ID }),
  })
}

describe("PATCH /api/quotes/[id]/agent-commission", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("saves a positive discount and nets it off the total", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 100000 }, captured)

    const response = await patch({ agentCommission: 5000, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.agentCommission).toBe(5000)
    expect(payload.total).toBe(95000)
    expect(captured.quoteUpdate?.agent_commission).toBe(5000)
    expect(captured.quoteUpdate?.total).toBe(95000)
  })

  it("clearing it back to zero restores the gross total", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 95000, agent_commission: 5000 }, captured)

    const response = await patch({ agentCommission: 0, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.total).toBe(100000)
  })

  it("rejects a negative amount", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    const response = await patch({ agentCommission: -100, expectedUpdatedAt: UPDATED_AT })
    expect(response.status).toBe(400)
    expect(captured.quoteUpdate).toBeUndefined()
  })

  it("rejects an amount larger than the subtotal", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 1000, total: 1000 }, captured)

    const response = await patch({ agentCommission: 5000, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/cannot exceed/)
    expect(captured.quoteUpdate).toBeUndefined()
  })

  it("refuses to edit a sent quote", async () => {
    const captured: Captured = {}
    authorise({ status: "sent" }, captured)

    const response = await patch({ agentCommission: 5000, expectedUpdatedAt: UPDATED_AT })
    expect(response.status).toBe(409)
    expect(captured.quoteUpdate).toBeUndefined()
  })

  it("refuses to edit an accepted quote", async () => {
    const captured: Captured = {}
    authorise({ status: "accepted" }, captured)

    const response = await patch({ agentCommission: 5000, expectedUpdatedAt: UPDATED_AT })
    expect(response.status).toBe(409)
  })

  it("rejects a stale version token", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", updated_at: "2026-08-30T09:00:00.000Z" }, captured)

    const response = await patch({ agentCommission: 5000, expectedUpdatedAt: UPDATED_AT })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe("STALE_VERSION")
  })

  it("requires expectedUpdatedAt or force", async () => {
    const captured: Captured = {}
    authorise({ status: "draft" }, captured)

    const response = await patch({ agentCommission: 5000 })
    expect(response.status).toBe(400)
  })

  it("writes an audit entry with the before/after amounts", async () => {
    const captured: Captured = {}
    authorise({ status: "draft", subtotal: 100000, total: 100000 }, captured)

    await patch({ agentCommission: 5000, expectedUpdatedAt: UPDATED_AT })

    expect(captured.auditInsert).toMatchObject({
      action: "quote_agent_commission_changed",
      before_json: { agentCommission: 0, total: 100000 },
      after_json: { agentCommission: 5000, total: 95000 },
    })
  })
})
