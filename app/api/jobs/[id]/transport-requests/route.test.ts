import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
  requireRole: authMocks.requireRole,
}))

vi.mock("@/lib/suppliers", () => ({
  mapBookingTransportRequest: vi.fn((row: { id: string }) => ({ id: row.id })),
}))

import { GET, PUT } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function buildSupabase() {
  const rentalDetailsInsert = vi.fn(async () => ({ error: null }))

  return {
    rentalDetailsInsert,
    from: vi.fn((table: string) => {
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [{ id: "tr1" }], error: null })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
          insert: vi.fn(async () => ({ error: null })),
        }
      }
      if (table === "booking_vehicle_rental_details") {
        return {
          insert: rentalDetailsInsert,
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { id: BOOKING_ID }, error: null })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

const params = Promise.resolve({ id: BOOKING_ID })

describe("GET /api/jobs/[id]/transport-requests", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(401)
  })

  it("returns the list when authenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: true,
      value: {
        supabase: buildSupabase(),
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([{ id: "tr1" }])
  })
})

describe("PUT /api/jobs/[id]/transport-requests", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const req = new Request("http://localhost", { method: "PUT", body: JSON.stringify({ transportRequests: [] }), headers: { "Content-Type": "application/json" } })
    const res = await PUT(req, { params })
    expect(res.status).toBe(401)
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request("http://localhost", { method: "PUT", body: JSON.stringify({ transportRequests: [] }), headers: { "Content-Type": "application/json" } })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 when body is invalid", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: buildSupabase(),
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ transportRequests: [{ serviceType: "bogus" }] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("replaces transport requests with an authorised role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: buildSupabase(),
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ transportRequests: [] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
  })

  it("requires rental details for vehicle rentals", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: buildSupabase(),
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        transportRequests: [{
          serviceType: "rental",
          pickupPoint: "A",
          dropoffPoint: "B",
          pickupAt: "2026-06-01T10:00:00.000Z",
          rentalDetails: null,
        }],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("saves vehicle rental details for rental requests", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase,
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        transportRequests: [{
          serviceType: "rental",
          pickupPoint: "A",
          dropoffPoint: "B",
          pickupAt: "2026-06-01T10:00:00.000Z",
          rentalDetails: {
            returnAt: "2026-06-03T10:00:00.000Z",
            returnCutoffTime: "10:00",
          },
        }],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.rentalDetailsInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        return_at: "2026-06-03T10:00:00.000Z",
        return_cutoff_time: "10:00",
      }),
    ])
  })
})
