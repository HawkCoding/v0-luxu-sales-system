import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const SERVICE_A = "00000000-0000-4000-8000-0000000000a1"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  bookingExists?: boolean
  services?: { id: string }[]
}

function buildSupabase(state: MockState = {}) {
  const serviceUpdateCalls: Array<{ eq: [string, unknown][] }> = []
  const unitUpdateCalls: unknown[] = []
  const bookingUpdateCalls: Record<string, unknown>[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                state.bookingExists === false ? { data: null, error: null } : { data: { id: BOOKING_ID }, error: null },
              ),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async () => {
              bookingUpdateCalls.push(payload)
              return { error: null }
            }),
          })),
        }
      }
      if (table === "booking_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: state.services ?? [{ id: SERVICE_A }], error: null })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => {
                serviceUpdateCalls.push({ eq: [["origin", payload.origin]] })
                return { error: null }
              }),
            })),
          })),
        }
      }
      if (table === "booking_service_units") {
        return {
          update: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(async () => {
                unitUpdateCalls.push(true)
                return { error: null }
              }),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, serviceUpdateCalls, unitUpdateCalls, bookingUpdateCalls }
}

function mockAuth(state: MockState = {}) {
  const built = buildSupabase(state)
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: built.supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com", isActive: true },
    },
  })
  return built
}

describe("POST /api/jobs/[id]/services/confirm", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 404 when the booking does not exist", async () => {
    mockAuth({ bookingExists: false })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 400 when the booking has no services", async () => {
    mockAuth({ services: [] })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())
    expect(res.status).toBe(400)
  })

  it("flips remaining auto-origin services and units to consultant, stamps the booking, and audits", async () => {
    const built = mockAuth({})
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.servicesConfirmedAt).toBeTruthy()
    expect(built.serviceUpdateCalls).toHaveLength(1)
    expect(built.unitUpdateCalls).toHaveLength(1)
    expect(built.bookingUpdateCalls[0]).toMatchObject({ services_confirmed_by: "u1" })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_services_confirmed" }),
    )
  })
})
