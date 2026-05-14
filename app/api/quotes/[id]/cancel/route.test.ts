import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/responses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/responses")>()
  return { ...actual }
})

import { POST } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-000000000ccc"

function buildAuth(quoteData: Record<string, unknown> | null, updateError: unknown = null) {
  const updateSpy = vi.fn().mockReturnValue({
    eq: vi.fn(async () => ({ error: updateError })),
  })
  const auditInsertSpy = vi.fn(async () => ({ data: null, error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: quoteData,
                error: quoteData ? null : { code: "PGRST116" },
              })),
            })),
          })),
          update: updateSpy,
        }
      }
      if (table === "audit_logs") {
        return { insert: auditInsertSpy }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Alice", name: "Alice", surname: "Smith", email: "u@example.com" },
    },
  })

  return { updateSpy, auditInsertSpy }
}

function makeRequest() {
  return new Request("https://example.com")
}

function makeParams(id = QUOTE_ID) {
  return { params: Promise.resolve({ id }) }
}

describe("POST /api/quotes/[id]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 404 when quote not found", async () => {
    buildAuth(null)
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(404)
  })

  it.each(["draft", "pricing_incomplete", "ready", "sent"])(
    "cancels a %s quote and emits audit log",
    async (status) => {
      const { updateSpy, auditInsertSpy } = buildAuth({
        id: QUOTE_ID,
        status,
        quote_number: `BT-2026-0001-Q1`,
      })

      const res = await POST(makeRequest(), makeParams())
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)

      expect(updateSpy).toHaveBeenCalledWith({ status: "cancelled" })
      expect(auditInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "quote_cancelled",
          entity_id: QUOTE_ID,
          after_json: { status: "cancelled" },
        }),
      )
    },
  )

  it("returns 400 when trying to cancel an accepted quote", async () => {
    buildAuth({ id: QUOTE_ID, status: "accepted", quote_number: "BT-2026-0001-Q1" })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/accepted/i)
  })

  it("returns 400 when trying to cancel a superseded quote", async () => {
    buildAuth({ id: QUOTE_ID, status: "superseded", quote_number: "BT-2026-0001-Q1" })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 400 when trying to cancel an expired quote", async () => {
    buildAuth({ id: QUOTE_ID, status: "expired", quote_number: "BT-2026-0001-Q1" })
    const res = await POST(makeRequest(), makeParams())
    expect(res.status).toBe(400)
  })
})
