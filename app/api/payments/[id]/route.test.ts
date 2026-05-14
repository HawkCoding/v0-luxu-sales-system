import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/invoices/sync-booking-payment-state", () => ({
  syncBookingPaymentState: vi.fn().mockResolvedValue(null),
}))

import { PATCH, DELETE } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const PAYMENT_ID = "00000000-0000-4000-8000-00000000bbbb"

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    booking_id: BOOKING_ID,
    amount: 1000,
    received_at: "2026-05-01T00:00:00.000Z",
    method: "EFT",
    reference: "REF-1",
    notes: null,
    ...overrides,
  }
}

function mockSuccessAuth({
  fetchResult = { data: paymentRow(), error: null } as { data: unknown; error: unknown },
  updateResult = { data: paymentRow(), error: null } as { data: unknown; error: unknown },
  deleteResult = { error: null } as { error: unknown },
} = {}) {
  const auditInsert = vi.fn(async () => ({ error: null }))

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "payments") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => fetchResult) })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(async () => updateResult),
                  })),
                })),
              })),
              delete: vi.fn(() => ({
                eq: vi.fn(async () => deleteResult),
              })),
            }
          }
          if (table === "audit_logs") return { insert: auditInsert }
          throw new Error(`Unexpected table: ${table}`)
        }),
      },
      user: { id: USER_ID, email: "x@example.com" },
      profile: { actorName: "Jane Doe", clearanceLevel: "manager" },
    },
  })

  return { auditInsert }
}

function makeRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/payments/${PAYMENT_ID}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

const params = Promise.resolve({ id: PAYMENT_ID })

describe("PATCH /api/payments/[id]", () => {
  beforeEach(() => authMocks.requireRole.mockReset())

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await PATCH(makeRequest("PATCH", { amount: 500 }), { params })
    expect(res.status).toBe(401)
  })

  it("returns 403 when role not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await PATCH(makeRequest("PATCH", { amount: 500 }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 404 when payment not found", async () => {
    mockSuccessAuth({ fetchResult: { data: null, error: { message: "not found" } } })
    const res = await PATCH(makeRequest("PATCH", { amount: 500 }), { params })
    expect(res.status).toBe(404)
  })

  it("returns 400 when body is empty object", async () => {
    mockSuccessAuth()
    const res = await PATCH(makeRequest("PATCH", {}), { params })
    expect(res.status).toBe(400)
  })

  it("updates payment and writes audit log", async () => {
    const { auditInsert } = mockSuccessAuth()
    const res = await PATCH(makeRequest("PATCH", { amount: 2000, method: "Credit Card" }), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: PAYMENT_ID })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "Jane Doe",
        actor_user_id: USER_ID,
        action: "payment_updated",
        entity_type: "Payment",
      }),
    )
  })
})

describe("DELETE /api/payments/[id]", () => {
  beforeEach(() => authMocks.requireRole.mockReset())

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await DELETE(makeRequest("DELETE"), { params })
    expect(res.status).toBe(401)
  })

  it("returns 403 when consultant (manager-only endpoint)", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await DELETE(makeRequest("DELETE"), { params })
    expect(res.status).toBe(403)
  })

  it("returns 404 when payment not found", async () => {
    mockSuccessAuth({ fetchResult: { data: null, error: { message: "not found" } } })
    const res = await DELETE(makeRequest("DELETE"), { params })
    expect(res.status).toBe(404)
  })

  it("deletes payment, writes audit log, returns 204", async () => {
    const { auditInsert } = mockSuccessAuth()
    const res = await DELETE(makeRequest("DELETE"), { params })
    expect(res.status).toBe(204)
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "Jane Doe",
        actor_user_id: USER_ID,
        action: "payment_deleted",
        entity_type: "Payment",
        before_json: expect.objectContaining({ amount: 1000, booking_id: BOOKING_ID }),
      }),
    )
  })
})
