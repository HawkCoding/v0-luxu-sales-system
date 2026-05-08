import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

import { PATCH } from "./route"

const PAYMENT_ID = "00000000-0000-4000-8000-00000000bbbb"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function buildSuccessAuth() {
  const updateChain = {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: PAYMENT_ID,
              booking_id: BOOKING_ID,
              amount: 500,
              received_at: "2026-05-01T00:00:00.000Z",
              method: "card",
              reference: null,
              notes: null,
            },
            error: null,
          })),
        })),
      })),
    })),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: { from: vi.fn(() => updateChain) },
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "manager", actorName: "Manager", name: "M", surname: "G", email: "u@example.com" },
    },
  })
}

function patchJson(body: unknown) {
  return new Request(`http://localhost/api/payments/${PAYMENT_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/payments/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await PATCH(patchJson({ amount: 5 }), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(401)
  })

  it("returns 403 when role disallowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await PATCH(patchJson({ amount: 5 }), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(403)
  })

  it("returns 400 when body is empty", async () => {
    buildSuccessAuth()
    const res = await PATCH(patchJson({}), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(400)
  })

  it("updates the payment on a valid body", async () => {
    buildSuccessAuth()
    const res = await PATCH(
      patchJson({ amount: 500, method: "card" }),
      { params: Promise.resolve({ id: PAYMENT_ID }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: PAYMENT_ID, amount: 500, method: "card" })
  })
})
