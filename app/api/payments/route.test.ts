import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

const syncMocks = vi.hoisted(() => ({
  syncBookingPaymentState: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/invoices/sync-booking-payment-state", () => ({
  syncBookingPaymentState: syncMocks.syncBookingPaymentState,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const PAYMENT_ID = "00000000-0000-4000-8000-00000000bbbb"

interface MockOpts {
  insertResult?: { data: unknown; error: unknown }
}

function mockSuccessAuth({ insertResult = { data: paymentRow(), error: null } }: MockOpts = {}) {
  const auditInsert = vi.fn(async () => ({ error: null }))
  const paymentInsert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => insertResult),
    })),
  }))

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "payments") return { insert: paymentInsert }
          if (table === "audit_logs") return { insert: auditInsert }
          throw new Error(`Unexpected table ${table}`)
        }),
      },
      user: { id: USER_ID, email: "x@example.com" },
      profile: {
        clearanceLevel: "consultant",
        actorName: "Jane Doe",
        name: "Jane",
        surname: "Doe",
        email: "x@example.com",
      },
    },
  })

  return { auditInsert, paymentInsert }
}

function paymentRow() {
  return {
    id: PAYMENT_ID,
    booking_id: BOOKING_ID,
    amount: 1000,
    received_at: "2026-05-01T00:00:00.000Z",
    method: "eft",
    reference: "REF-1",
    notes: null,
  }
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/payments", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID, amount: 100, method: "eft" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(postJson({ bookingId: BOOKING_ID, amount: 100, method: "eft" }))
    expect(res.status).toBe(403)
  })

  it("returns 400 when body is invalid", async () => {
    mockSuccessAuth()
    const res = await POST(postJson({ amount: 0, method: "eft" })) // no bookingId/jobId
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; details?: unknown }
    expect(body.error).toBe("Invalid request body")
    expect(body.details).toBeDefined()
  })

  it("creates the payment and writes an audit log with the authed actor", async () => {
    const { auditInsert } = mockSuccessAuth()
    const res = await POST(postJson({ bookingId: BOOKING_ID, amount: 1000, method: "eft", reference: "REF-1" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: PAYMENT_ID, bookingId: BOOKING_ID, amount: 1000 })
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "Jane Doe", actor_user_id: USER_ID, entity_type: "Payment" }),
    )
  })

  it("calls syncBookingPaymentState with the booking id after successful insert", async () => {
    syncMocks.syncBookingPaymentState.mockClear()
    mockSuccessAuth()
    await POST(postJson({ bookingId: BOOKING_ID, amount: 1000, method: "eft" }))
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      expect.objectContaining({ actorName: "Jane Doe", actorUserId: USER_ID }),
    )
  })
})
