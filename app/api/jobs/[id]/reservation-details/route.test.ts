import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { GET, PUT } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000e001"

function buildAuthValue(supabase = buildSupabase()) {
  return {
    supabase,
    user: { id: "u1", email: "u@example.com" },
    profile: {
      clearanceLevel: "consultant",
      actorName: "Jane",
      name: "Jane",
      surname: "D",
      email: "u@example.com",
    },
  }
}

function buildSupabase(opts: { bookingExists?: boolean; existingRow?: Record<string, unknown> | null } = {}) {
  const upsertCalls: unknown[] = []

  return {
    upsertCalls,
    from: vi.fn((table: string) => {
      if (table === "booking_reservation_details") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.existingRow === undefined ? null : opts.existingRow,
                error: null,
              })),
            })),
          })),
          upsert: vi.fn((payload: unknown) => {
            upsertCalls.push(payload)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: "row-1",
                    booking_id: BOOKING_ID,
                    dietary: "Vegetarian",
                    medical: null,
                    occasion: null,
                    smoking_preference: "non_smoking",
                    meal_seating: "first",
                    agency_name: "Acme Travel",
                    agency_address: "1 Main Rd",
                    updated_at: "2026-07-19T00:00:00.000Z",
                  },
                  error: null,
                })),
              })),
            }
          }),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.bookingExists === false ? null : { id: BOOKING_ID },
                error: null,
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

const params = Promise.resolve({ id: BOOKING_ID })

describe("GET /api/jobs/[id]/reservation-details", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(403)
  })

  it("returns empty defaults when no row exists yet", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      dietary: "",
      medical: "",
      occasion: "",
      smokingPreference: null,
      mealSeating: null,
      agencyName: "",
      agencyAddress: "",
      updatedAt: null,
    })
  })
})

describe("PUT /api/jobs/[id]/reservation-details", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 for an invalid smoking preference", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ smokingPreference: "maybe" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 404 when the booking does not exist", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(buildSupabase({ bookingExists: false })),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(404)
  })

  it("upserts details and writes an audit log", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        dietary: "Vegetarian",
        smokingPreference: "non_smoking",
        mealSeating: "first",
        agencyName: "Acme Travel",
        agencyAddress: "1 Main Rd",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.upsertCalls).toEqual([
      expect.objectContaining({
        booking_id: BOOKING_ID,
        dietary: "Vegetarian",
        smoking_preference: "non_smoking",
        meal_seating: "first",
        agency_name: "Acme Travel",
        agency_address: "1 Main Rd",
      }),
    ])
    const body = await res.json()
    expect(body).toMatchObject({ dietary: "Vegetarian", agencyName: "Acme Travel" })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ action: "reservation_details_updated", entityId: BOOKING_ID }),
    )
  })
})
