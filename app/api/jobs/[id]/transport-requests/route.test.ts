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

/** Column list from the PUT handler's existing-provenance pre-fetch, kept here to distinguish it
 * from the list/reload query below (same table, no .order() call). */
const PROVENANCE_COLUMNS = "id, price_override, price_override_set_at, price_override_set_by"

function buildSupabase(options: { savedRows?: unknown[]; existingRows?: unknown[] } = {}) {
  const savedRows = options.savedRows ?? [{ id: "tr1" }]
  const existingRows = options.existingRows ?? []
  const replaceTransportRequests = vi.fn(async (_args: unknown) => ({ error: null }))

  return {
    replaceTransportRequests,
    rpc: vi.fn((name: string, args: unknown) => {
      if (name === "replace_booking_transport_requests") {
        return replaceTransportRequests(args)
      }
      throw new Error(`Unexpected rpc ${name}`)
    }),
    from: vi.fn((table: string) => {
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn((columns: string) => {
            if (columns === PROVENANCE_COLUMNS) {
              return { eq: vi.fn(async () => ({ data: existingRows, error: null })) }
            }
            return {
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({ data: savedRows, error: null })),
              })),
            }
          }),
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
      // recomputeBookingTripDates also checks Build Booking's booking_services -- these fixtures
      // have none.
      if (table === "booking_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
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

  it("threads packageLegId through to the replace RPC, normalizing omitted to null", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase,
        user: { id: "u1", email: "u@example.com" },
        profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
      },
    })
    const LEG_ID = "00000000-0000-4000-8000-0000000000a1"
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        transportRequests: [
          { serviceType: "transfer", packageLegId: LEG_ID, pickupPoint: "A", dropoffPoint: "B" },
          { serviceType: "transfer", pickupPoint: "C", dropoffPoint: "D" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.replaceTransportRequests).toHaveBeenCalledWith({
      p_booking_id: BOOKING_ID,
      p_transport_requests: [
        expect.objectContaining({ package_leg_id: LEG_ID }),
        expect.objectContaining({ package_leg_id: null }),
      ],
      p_rental_details: [],
    })
  })

  it("threads complimentary through to the replace RPC, defaulting omitted to false", async () => {
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
        transportRequests: [
          { serviceType: "transfer", pickupPoint: "A", dropoffPoint: "B", complimentary: true },
          { serviceType: "transfer", pickupPoint: "C", dropoffPoint: "D" },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.replaceTransportRequests).toHaveBeenCalledWith({
      p_booking_id: BOOKING_ID,
      p_transport_requests: [
        expect.objectContaining({ complimentary: true }),
        expect.objectContaining({ complimentary: false }),
      ],
      p_rental_details: [],
    })
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
    expect(supabase.replaceTransportRequests).toHaveBeenCalledWith({
      p_booking_id: BOOKING_ID,
      p_transport_requests: [
        expect.objectContaining({
          service_type: "rental",
          pickup_point: "A",
          dropoff_point: "B",
        }),
      ],
      p_rental_details: [
        expect.objectContaining({
          return_at: "2026-06-03T10:00:00.000Z",
          return_cutoff_time: "10:00",
        }),
      ],
    })
  })

  it("threads dateAnchor through to the replace RPC for a transfer", async () => {
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
        transportRequests: [{ serviceType: "transfer", pickupPoint: "A", dropoffPoint: "B", dateAnchor: "post" }],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.replaceTransportRequests).toHaveBeenCalledWith({
      p_booking_id: BOOKING_ID,
      p_transport_requests: [expect.objectContaining({ date_anchor: "post" })],
      p_rental_details: [],
    })
  })

  it("rejects a pre/post anchor on a vehicle rental — it has no single leg to anchor two dates to", async () => {
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
          dateAnchor: "pre",
          rentalDetails: { returnAt: "2026-06-03T10:00:00.000Z" },
        }],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  describe("price override provenance", () => {
    it("stamps a brand-new override with the current user and a fresh timestamp", async () => {
      const supabase = buildSupabase({ existingRows: [] })
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
          transportRequests: [{ serviceType: "transfer", pickupPoint: "A", dropoffPoint: "B", priceOverride: 850 }],
        }),
        headers: { "Content-Type": "application/json" },
      })
      const res = await PUT(req, { params })
      expect(res.status).toBe(200)
      const { p_transport_requests: rows } = supabase.replaceTransportRequests.mock.calls[0][0] as {
        p_transport_requests: Record<string, unknown>[]
      }
      expect(rows[0].price_override).toBe(850)
      expect(rows[0].price_override_set_by).toBe("u1")
      expect(typeof rows[0].price_override_set_at).toBe("string")
    })

    it("keeps the original stamp when the override is re-saved unchanged", async () => {
      const REQUEST_ID = "00000000-0000-4000-8000-0000000000b1"
      const supabase = buildSupabase({
        existingRows: [
          { id: REQUEST_ID, price_override: 850, price_override_set_at: "2026-08-01T00:00:00Z", price_override_set_by: "u-original" },
        ],
      })
      authMocks.requireRole.mockResolvedValue({
        ok: true,
        value: {
          supabase,
          user: { id: "u2", email: "u2@example.com" },
          profile: { clearanceLevel: "consultant", actorName: "Alex", name: "Alex", surname: "K", email: "u2@example.com" },
        },
      })
      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          transportRequests: [{ id: REQUEST_ID, serviceType: "transfer", pickupPoint: "A", dropoffPoint: "B", priceOverride: 850 }],
        }),
        headers: { "Content-Type": "application/json" },
      })
      const res = await PUT(req, { params })
      expect(res.status).toBe(200)
      const { p_transport_requests: rows } = supabase.replaceTransportRequests.mock.calls[0][0] as {
        p_transport_requests: Record<string, unknown>[]
      }
      expect(rows[0].price_override_set_at).toBe("2026-08-01T00:00:00Z")
      expect(rows[0].price_override_set_by).toBe("u-original")
    })

    it("re-stamps when the override value changes", async () => {
      const REQUEST_ID = "00000000-0000-4000-8000-0000000000b2"
      const supabase = buildSupabase({
        existingRows: [
          { id: REQUEST_ID, price_override: 850, price_override_set_at: "2026-08-01T00:00:00Z", price_override_set_by: "u-original" },
        ],
      })
      authMocks.requireRole.mockResolvedValue({
        ok: true,
        value: {
          supabase,
          user: { id: "u2", email: "u2@example.com" },
          profile: { clearanceLevel: "consultant", actorName: "Alex", name: "Alex", surname: "K", email: "u2@example.com" },
        },
      })
      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          transportRequests: [{ id: REQUEST_ID, serviceType: "transfer", pickupPoint: "A", dropoffPoint: "B", priceOverride: 950 }],
        }),
        headers: { "Content-Type": "application/json" },
      })
      const res = await PUT(req, { params })
      expect(res.status).toBe(200)
      const { p_transport_requests: rows } = supabase.replaceTransportRequests.mock.calls[0][0] as {
        p_transport_requests: Record<string, unknown>[]
      }
      expect(rows[0].price_override).toBe(950)
      expect(rows[0].price_override_set_by).toBe("u2")
      expect(rows[0].price_override_set_at).not.toBe("2026-08-01T00:00:00Z")
    })

    it("clears both stamps when the override is cleared to null", async () => {
      const REQUEST_ID = "00000000-0000-4000-8000-0000000000b3"
      const supabase = buildSupabase({
        existingRows: [
          { id: REQUEST_ID, price_override: 850, price_override_set_at: "2026-08-01T00:00:00Z", price_override_set_by: "u-original" },
        ],
      })
      authMocks.requireRole.mockResolvedValue({
        ok: true,
        value: {
          supabase,
          user: { id: "u2", email: "u2@example.com" },
          profile: { clearanceLevel: "consultant", actorName: "Alex", name: "Alex", surname: "K", email: "u2@example.com" },
        },
      })
      const req = new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          transportRequests: [{ id: REQUEST_ID, serviceType: "transfer", pickupPoint: "A", dropoffPoint: "B", priceOverride: null }],
        }),
        headers: { "Content-Type": "application/json" },
      })
      const res = await PUT(req, { params })
      expect(res.status).toBe(200)
      const { p_transport_requests: rows } = supabase.replaceTransportRequests.mock.calls[0][0] as {
        p_transport_requests: Record<string, unknown>[]
      }
      expect(rows[0].price_override).toBeNull()
      expect(rows[0].price_override_set_at).toBeNull()
      expect(rows[0].price_override_set_by).toBeNull()
    })
  })
})
