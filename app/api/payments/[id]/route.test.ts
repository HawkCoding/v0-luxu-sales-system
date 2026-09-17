import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

const syncMocks = vi.hoisted(() => ({
  syncBookingPaymentState: vi.fn(async () => null),
}))

const settingsMocks = vi.hoisted(() => ({
  getPaymentReferenceRequired: vi.fn(async () => false),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

vi.mock("@/lib/invoices/sync-booking-payment-state", () => ({
  syncBookingPaymentState: syncMocks.syncBookingPaymentState,
}))

vi.mock("@/lib/settings-access", () => ({
  getPaymentReferenceRequired: settingsMocks.getPaymentReferenceRequired,
}))

import { DELETE, PATCH } from "./route"

const PAYMENT_ID = "00000000-0000-4000-8000-00000000bbbb"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

const EXISTING_ROW = {
  id: PAYMENT_ID,
  booking_id: BOOKING_ID,
  invoice_id: null,
  amount: 500,
  received_at: "2026-05-01T00:00:00.000Z",
  payment_kind: "capture" as const,
  method: "card",
  reference: "REF-1",
  notes: null,
}

function buildSupabase(overrides?: { existing?: Partial<typeof EXISTING_ROW> | null; updated?: Record<string, unknown> }) {
  const existingRow = overrides?.existing === null ? null : { ...EXISTING_ROW, ...overrides?.existing }
  const updatedRow = overrides?.updated ?? {
    id: PAYMENT_ID,
    booking_id: BOOKING_ID,
    amount: 500,
    received_at: "2026-05-01T00:00:00.000Z",
    method: "card",
    reference: "REF-1",
    notes: null,
  }

  const from = vi.fn((table: string) => {
    if (table === "payments") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: existingRow, error: existingRow ? null : { message: "not found" } })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: updatedRow, error: null })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { from }
}

function buildSuccessAuth(supabaseOverrides?: Parameters<typeof buildSupabase>[0]) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: buildSupabase(supabaseOverrides),
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

function deleteReq() {
  return new Request(`http://localhost/api/payments/${PAYMENT_ID}`, { method: "DELETE" })
}

describe("PATCH /api/payments/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
    syncMocks.syncBookingPaymentState.mockClear()
    settingsMocks.getPaymentReferenceRequired.mockReset()
    settingsMocks.getPaymentReferenceRequired.mockResolvedValue(false)
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

  it("returns 404 when the payment doesn't exist", async () => {
    buildSuccessAuth({ existing: null })
    const res = await PATCH(patchJson({ amount: 5 }), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(404)
  })

  it("updates the payment, writes an audit log and resyncs the booking", async () => {
    buildSuccessAuth()
    const res = await PATCH(
      patchJson({ amount: 500, method: "card" }),
      { params: Promise.resolve({ id: PAYMENT_ID }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: PAYMENT_ID, amount: 500, method: "card" })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "Payment", action: "payment_updated" }),
    )
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      expect.objectContaining({ actorUserId: "u1" }),
    )
  })

  it("rejects an amount that flips sign against the existing payment_kind", async () => {
    buildSuccessAuth()
    const res = await PATCH(patchJson({ amount: -5 }), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(400)
  })

  it("rejects clearing the reference when references are required", async () => {
    settingsMocks.getPaymentReferenceRequired.mockResolvedValue(true)
    buildSuccessAuth()
    const res = await PATCH(patchJson({ reference: null }), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(400)
  })

  it("allows a save that only touches amount when the existing reference already satisfies the requirement", async () => {
    settingsMocks.getPaymentReferenceRequired.mockResolvedValue(true)
    buildSuccessAuth()
    const res = await PATCH(patchJson({ amount: 600 }), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/payments/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
    syncMocks.syncBookingPaymentState.mockClear()
  })

  it("returns 401 unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(401)
  })

  it("returns 403 when role disallowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(403)
  })

  it("returns 404 when the payment doesn't exist", async () => {
    buildSuccessAuth({ existing: null })
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(404)
  })

  it("deletes the payment, writes an audit log with the deleted data and resyncs the booking", async () => {
    buildSuccessAuth()
    const res = await DELETE(deleteReq(), { params: Promise.resolve({ id: PAYMENT_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id: PAYMENT_ID, deleted: true })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Payment",
        action: "payment_deleted",
        before: expect.objectContaining({ amount: EXISTING_ROW.amount, booking_id: BOOKING_ID }),
        after: null,
      }),
    )
    expect(syncMocks.syncBookingPaymentState).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      expect.objectContaining({ actorUserId: "u1" }),
    )
  })
})
