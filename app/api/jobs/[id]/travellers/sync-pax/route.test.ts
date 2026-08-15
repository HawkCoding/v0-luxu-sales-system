import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireRole: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireRole: authMocks.requireRole }))

const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({ writeAuditLog: auditMocks.writeAuditLog }))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  bookingExists?: boolean
  booking?: Record<string, unknown>
  travellers?: { date_of_birth: string | null; is_child: boolean }[]
  liveQuotes?: { quote_number: string | null }[]
}

function buildSupabase(state: MockState = {}) {
  const bookingUpdates: Record<string, unknown>[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                state.bookingExists === false
                  ? { data: null, error: null }
                  : {
                      data: {
                        id: BOOKING_ID,
                        no_of_adults: 2,
                        no_of_children: 0,
                        child_ages: [],
                        trip_start_date: "2026-09-12",
                        departure_date: "2026-09-12",
                        ...state.booking,
                      },
                      error: null,
                    },
              ),
            })),
          })),
          update: vi.fn((values: Record<string, unknown>) => ({
            eq: vi.fn(async () => {
              bookingUpdates.push(values)
              return { error: null }
            }),
          })),
        }
      }

      if (table === "travellers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: state.travellers ?? [], error: null })),
            })),
          })),
        }
      }

      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ data: state.liveQuotes ?? [], error: null })),
            })),
          })),
        }
      }

      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, bookingUpdates }
}

function mockAuth(state: MockState = {}) {
  const built = buildSupabase(state)
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: built.supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: {
        clearanceLevel: "consultant",
        actorName: "Jane",
        name: "Jane",
        surname: "D",
        email: "u@example.com",
        isActive: true,
      },
    },
  })
  return built
}

describe("POST /api/jobs/[id]/travellers/sync-pax", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 404 when the booking does not exist", async () => {
    mockAuth({ bookingExists: false })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns 400 when no guests have been captured", async () => {
    const built = mockAuth({ travellers: [] })
    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(400)
    expect(built.bookingUpdates).toHaveLength(0)
  })

  it("writes the roster into the booking's pricing pax (F10-2)", async () => {
    const built = mockAuth({
      travellers: [
        { date_of_birth: "1980-01-01", is_child: false },
        { date_of_birth: "1982-03-02", is_child: false },
        { date_of_birth: "2016-05-05", is_child: true },
        { date_of_birth: "2025-08-08", is_child: true },
      ],
    })

    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    expect(built.bookingUpdates).toEqual([
      { no_of_adults: 2, no_of_children: 2, child_ages: [10, 1] },
    ])
    const body = await res.json()
    expect(body.totals).toEqual({ adultCount: 2, childCount: 1, infantCount: 1 })
    expect(body.warning).toBeNull()
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_pax_synced_from_roster" }),
    )
  })

  it("refuses when a child guest has no date of birth, rather than guessing an age", async () => {
    const built = mockAuth({
      travellers: [
        { date_of_birth: "1980-01-01", is_child: false },
        { date_of_birth: null, is_child: true },
      ],
    })

    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(400)
    expect(built.bookingUpdates).toHaveLength(0)
    const body = await res.json()
    expect(body.error).toMatch(/date of birth/)
  })

  it("warns that a live quote keeps its old prices", async () => {
    mockAuth({
      travellers: [{ date_of_birth: "1980-01-01", is_child: false }],
      liveQuotes: [{ quote_number: "LTT-2026-0034-Q1" }],
    })

    const res = await POST(new Request("http://localhost", { method: "POST" }), makeParams())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warning).toContain("LTT-2026-0034-Q1")
  })
})
