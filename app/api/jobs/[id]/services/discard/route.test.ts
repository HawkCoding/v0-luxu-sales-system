import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const AUTO_SERVICE = "00000000-0000-4000-8000-0000000000a1"
const CONSULTANT_SERVICE = "00000000-0000-4000-8000-0000000000a2"
const QUOTE_ID = "00000000-0000-4000-8000-0000000000q1"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  bookingExists?: boolean
  services?: { id: string; origin: string }[]
  quotes?: { id: string }[]
  liveQuotes?: { id: string; quote_number: string | null; status: string }[]
}

function buildSupabase(state: MockState = {}) {
  const deletedServiceIds: string[][] = []
  const voidedQuoteIds: string[][] = []

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
        }
      }
      if (table === "booking_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: state.services ?? [{ id: AUTO_SERVICE, origin: "auto" }],
              error: null,
            })),
          })),
          delete: vi.fn(() => ({
            in: vi.fn(async (_col: string, ids: string[]) => {
              deletedServiceIds.push(ids)
              return { error: null }
            }),
          })),
        }
      }
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              // The route queries quotes twice with different status filters: once for live
              // (sent/accepted) quotes that block the discard, once for voidable drafts.
              in: vi.fn(async (_col: string, statuses: string[]) =>
                statuses.includes("sent")
                  ? { data: state.liveQuotes ?? [], error: null }
                  : { data: state.quotes ?? [{ id: QUOTE_ID }], error: null },
              ),
            })),
          })),
          update: vi.fn(() => ({
            in: vi.fn(async (_col: string, ids: string[]) => {
              voidedQuoteIds.push(ids)
              return { error: null }
            }),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, deletedServiceIds, voidedQuoteIds }
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

describe("POST /api/jobs/[id]/services/discard", () => {
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

  it("is idempotent: no-ops when nothing is left with origin='auto'", async () => {
    const built = mockAuth({ services: [{ id: CONSULTANT_SERVICE, origin: "consultant" }] })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ discarded: 0, warning: null })
    expect(built.deletedServiceIds).toHaveLength(0)
  })

  it("deletes only auto-origin services, voids the draft quote, and audits", async () => {
    const built = mockAuth({ services: [{ id: AUTO_SERVICE, origin: "auto" }] })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ discarded: 1, warning: null })
    expect(built.deletedServiceIds).toEqual([[AUTO_SERVICE]])
    expect(built.voidedQuoteIds).toEqual([[QUOTE_ID]])
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "auto_build_discarded" }),
    )
  })

  it("keeps consultant-edited services and reports how many survived", async () => {
    const built = mockAuth({
      services: [
        { id: AUTO_SERVICE, origin: "auto" },
        { id: CONSULTANT_SERVICE, origin: "consultant" },
      ],
    })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.discarded).toBe(1)
    expect(body.warning).toMatch(/1 service.*was kept/)
    expect(built.deletedServiceIds).toEqual([[AUTO_SERVICE]])
  })

  it("does not touch quotes when none are in a voidable status", async () => {
    const built = mockAuth({ quotes: [] })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    expect(built.voidedQuoteIds).toHaveLength(0)
  })

  it("refuses with 409 when a sent quote is priced from the services (F10-1)", async () => {
    const built = mockAuth({
      services: [{ id: AUTO_SERVICE, origin: "auto" }],
      liveQuotes: [{ id: QUOTE_ID, quote_number: "LTT-2026-0049-Q1", status: "sent" }],
    })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("LIVE_QUOTE_EXISTS")
    expect(body.error).toContain("LTT-2026-0049-Q1")
    expect(built.deletedServiceIds).toHaveLength(0)
    expect(built.voidedQuoteIds).toHaveLength(0)
    expect(auditMocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it("refuses with 409 when an accepted quote exists", async () => {
    const built = mockAuth({
      services: [{ id: AUTO_SERVICE, origin: "auto" }],
      liveQuotes: [{ id: QUOTE_ID, quote_number: null, status: "accepted" }],
    })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(409)
    expect(built.deletedServiceIds).toHaveLength(0)
  })

  it("stays a 200 no-op with a live quote once there is nothing left to discard", async () => {
    const built = mockAuth({
      services: [{ id: CONSULTANT_SERVICE, origin: "consultant" }],
      liveQuotes: [{ id: QUOTE_ID, quote_number: "LTT-2026-0049-Q1", status: "sent" }],
    })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ discarded: 0, warning: null })
    expect(built.deletedServiceIds).toHaveLength(0)
  })
})
