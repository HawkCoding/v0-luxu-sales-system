import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

import { POST } from "./route"

const QUOTE_ID = "00000000-0000-4000-8000-00000000dddd"

const PARENT_ID = "00000000-0000-4000-8000-00000000eeee"

interface ParentOptions {
  parentStatus?: string | null
  /** Other revisions of the same parent. */
  siblings?: Array<{ id: string; status: string }>
}

function buildAuth(quoteData: { status: string; parentQuoteId?: string | null } | null, parent: ParentOptions = {}) {
  const auditInsert = vi.fn(async () => ({ error: null }))
  const quoteUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string) => {
              if (column === "parent_quote_id") {
                return { neq: vi.fn(async () => ({ data: parent.siblings ?? [], error: null })) }
              }
              return {
                single: vi.fn(async () => ({
                  data: quoteData
                    ? {
                        id: QUOTE_ID,
                        status: quoteData.status,
                        quote_number: "BT-2026-0001-Q1",
                        booking_id: "b1",
                        parent_quote_id: quoteData.parentQuoteId ?? null,
                      }
                    : null,
                  error: quoteData ? null : { message: "not found" },
                })),
                maybeSingle: vi.fn(async () => ({
                  data: parent.parentStatus ? { id: PARENT_ID, status: parent.parentStatus } : null,
                  error: null,
                })),
              }
            }),
          })),
          update: quoteUpdate,
        }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
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

  return { auditInsert, quoteUpdate }
}

const routeParams = { params: Promise.resolve({ id: QUOTE_ID }) }

function req() {
  return new Request(`http://localhost/api/quotes/${QUOTE_ID}/cancel`, { method: "POST" })
}

describe("POST /api/quotes/[id]/cancel", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(req(), routeParams)
    expect(res.status).toBe(401)
  })

  it("returns 404 when the quote does not exist", async () => {
    buildAuth(null)
    const res = await POST(req(), routeParams)
    expect(res.status).toBe(404)
  })

  it("returns 400 when the quote is already accepted", async () => {
    buildAuth({ status: "accepted" })
    const res = await POST(req(), routeParams)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Only quotes that have not been accepted can be cancelled")
  })

  it("cancels a sent quote and writes an audit log", async () => {
    const { quoteUpdate, auditInsert } = buildAuth({ status: "sent" })
    const res = await POST(req(), routeParams)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: QUOTE_ID, status: "cancelled", reactivatedQuoteId: null })
    expect(quoteUpdate).toHaveBeenCalledWith({ status: "cancelled" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quote_cancelled", entity_id: QUOTE_ID }),
    )
  })

  describe("cancelling a revision", () => {
    it("brings the superseded parent quote back as sent", async () => {
      const { quoteUpdate, auditInsert } = buildAuth(
        { status: "draft", parentQuoteId: PARENT_ID },
        { parentStatus: "superseded" },
      )
      const res = await POST(req(), routeParams)

      expect(res.status).toBe(200)
      expect((await res.json()).reactivatedQuoteId).toBe(PARENT_ID)
      expect(quoteUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }))
      expect(auditInsert).toHaveBeenCalledWith(
        expect.objectContaining({ action: "quote_reactivated", entity_id: PARENT_ID }),
      )
    })

    it("leaves the parent closed when another revision of it is still live", async () => {
      const { quoteUpdate } = buildAuth(
        { status: "draft", parentQuoteId: PARENT_ID },
        { parentStatus: "superseded", siblings: [{ id: "other", status: "draft" }] },
      )
      const res = await POST(req(), routeParams)

      expect(res.status).toBe(200)
      expect((await res.json()).reactivatedQuoteId).toBeNull()
      expect(quoteUpdate).toHaveBeenCalledTimes(1)
    })

    it("reactivates when the only other revisions are dead", async () => {
      buildAuth(
        { status: "draft", parentQuoteId: PARENT_ID },
        { parentStatus: "superseded", siblings: [{ id: "old", status: "cancelled" }] },
      )
      const res = await POST(req(), routeParams)
      expect((await res.json()).reactivatedQuoteId).toBe(PARENT_ID)
    })

    it("does not touch a parent that is not superseded", async () => {
      const { quoteUpdate } = buildAuth(
        { status: "draft", parentQuoteId: PARENT_ID },
        { parentStatus: "accepted" },
      )
      const res = await POST(req(), routeParams)

      expect((await res.json()).reactivatedQuoteId).toBeNull()
      expect(quoteUpdate).toHaveBeenCalledTimes(1)
    })
  })
})
