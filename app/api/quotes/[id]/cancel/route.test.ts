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

function buildAuth(quoteData: { status: string } | null) {
  const auditInsert = vi.fn(async () => ({ error: null }))
  const quoteUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: quoteData
                  ? { id: QUOTE_ID, status: quoteData.status, quote_number: "BT-2026-0001-Q1", booking_id: "b1" }
                  : null,
                error: quoteData ? null : { message: "not found" },
              })),
            })),
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
    expect(body).toEqual({ id: QUOTE_ID, status: "cancelled" })
    expect(quoteUpdate).toHaveBeenCalledWith({ status: "cancelled" })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quote_cancelled", entity_id: QUOTE_ID }),
    )
  })
})
