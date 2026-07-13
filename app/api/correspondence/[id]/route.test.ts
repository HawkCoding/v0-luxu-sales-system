import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { GET, PATCH } from "./route"

const COR_ID = "00000000-0000-4000-8000-00000000cccc"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function seed(overrides: Record<string, unknown> = {}) {
  return createSupabaseMock({
    correspondences: [
      {
        id: COR_ID,
        booking_id: BOOKING_ID,
        kind: "thank_you",
        status: "scheduled",
        subject: "Thank you for travelling with us",
        body_html: "<html><p>thank you</p></html>",
        scheduled_at: "2026-07-10T00:00:00.000Z",
        recipients: null,
        ...overrides,
      },
    ],
    bookings: [{ id: BOOKING_ID, booking_number: "RR-2026-0001", customer_id: "customer-1" }],
    customers: [
      { id: "customer-1", first_name: "Jane", last_name: "Smith", email: "jane@example.test" },
    ],
  })
}

function mockAuthOk(supabase: unknown) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1" },
      profile: { clearanceLevel: "consultant", actorName: "Jane" },
    },
  })
}

function routeParams() {
  return { params: Promise.resolve({ id: COR_ID }) }
}

function patchRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/correspondence/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns the scheduled draft with booking + recipient context", async () => {
    const { supabase } = seed()
    mockAuthOk(supabase)

    const res = await GET(new Request("http://localhost"), routeParams())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      id: COR_ID,
      bookingId: BOOKING_ID,
      bookingNumber: "RR-2026-0001",
      status: "scheduled",
      to: "jane@example.test",
    })
    expect(body.bodyHtml).toContain("thank you")
  })
})

describe("PATCH /api/correspondence/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("dismisses a scheduled correspondence", async () => {
    const { supabase, store } = seed()
    mockAuthOk(supabase)

    const res = await PATCH(patchRequest({ action: "dismiss" }), routeParams())
    expect(res.status).toBe(200)
    expect(store.rows("correspondences")[0]).toMatchObject({ status: "cancelled" })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "scheduled_email_dismissed" }),
    )
  })

  it("refuses to dismiss an already-sent correspondence", async () => {
    const { supabase, store } = seed({ status: "sent" })
    mockAuthOk(supabase)

    const res = await PATCH(patchRequest({ action: "dismiss" }), routeParams())
    expect(res.status).toBe(409)
    expect(store.rows("correspondences")[0]).toMatchObject({ status: "sent" })
  })

  it("rejects unknown actions", async () => {
    const { supabase } = seed()
    mockAuthOk(supabase)

    const res = await PATCH(patchRequest({ action: "resend" }), routeParams())
    expect(res.status).toBe(400)
  })
})
