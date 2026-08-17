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

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

const tripDateMocks = vi.hoisted(() => ({
  recomputeBookingTripDates: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/packages/recompute-trip-dates", () => ({
  recomputeBookingTripDates: tripDateMocks.recomputeBookingTripDates,
}))

import { GET, PATCH } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const FLIGHT_LEG = "00000000-0000-4000-8000-0000000000a1"
const HOTEL_LEG = "00000000-0000-4000-8000-0000000000a2"
const TRANSPORT_ID = "00000000-0000-4000-8000-0000000000b1"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  serviceRows?: unknown[]
  transportRows?: unknown[]
  /** Supplier kind per booking_services id, as the PATCH guard reads it. */
  serviceKinds?: Record<string, string>
  serviceDates?: Record<string, string | null>
  /** A generated voucher on the booking, for the staleness flag. */
  voucher?: { generated_at: string | null; sent_at: string | null } | null
  /** An accepted quote exists — proves the route never consults the quote lock. */
  acceptedQuote?: { id: string; quote_number: string } | null
  /** Line-item snapshots behind that quote, which is where the priced leg ids come from. */
  quoteLineItems?: Array<{ pricing_snapshot: unknown }>
}

function buildSupabase(state: MockState = {}) {
  const serviceUpdates: Array<{ serviceId: string; payload: Record<string, unknown> }> = []
  const transportUpdates: Array<{ requestId: string; payload: Record<string, unknown> }> = []
  const rentalUpdates: Array<{ requestId: string; payload: Record<string, unknown> }> = []

  const serviceRows =
    state.serviceRows ??
    [
      {
        id: FLIGHT_LEG,
        label: "Positioning flight",
        sort_order: 0,
        service_date: "2026-10-14",
        departure_time: "10:00:00",
        arrival_date: "2026-10-14",
        arrival_time: "12:15:00",
        flight_number: "FA212",
        departure_airport_code: "HLA",
        arrival_airport_code: "CPT",
        updated_at: "2026-08-17T09:00:00.000Z",
        suppliers: { name: "SAfair", kind: "airline" },
        routes: { name: "Lanseria INT Airport → Cape Town INT Airport" },
      },
    ]

  const transportRows =
    state.transportRows ??
    [
      {
        id: TRANSPORT_ID,
        service_id: null,
        service_type: "transfer",
        pickup_point: "Cape Town INT Airport",
        dropoff_point: "The Silo Hotel",
        pickup_at: "2026-10-14T12:45:00+02:00",
        flight_number: "FA212",
        sort_order: 0,
        updated_at: "2026-08-17T09:00:00.000Z",
        suppliers: { name: "Cape Chauffeurs" },
        rental_details: null,
      },
    ]

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "booking_services") {
        return {
          select: vi.fn((columns: string) => {
            // The PATCH kind guard: a narrow id/kind lookup, not the list read.
            if (columns.includes("suppliers(kind)") && !columns.includes("routes(")) {
              return {
                eq: vi.fn(() => ({
                  in: vi.fn(async (_col: string, ids: string[]) => ({
                    data: ids.map((serviceId) => ({
                      id: serviceId,
                      service_date: state.serviceDates?.[serviceId] ?? null,
                      suppliers: { kind: state.serviceKinds?.[serviceId] ?? "airline" },
                    })),
                    error: null,
                  })),
                })),
              }
            }
            const query: Record<string, unknown> = {}
            query.eq = vi.fn(() => query)
            query.then = (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: serviceRows, error: null }).then(resolve)
            return query
          }),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async (_col: string, serviceId: string) => {
                serviceUpdates.push({ serviceId, payload })
                return { error: null }
              }),
            })),
          })),
        }
      }
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => {
            const query: Record<string, unknown> = {}
            query.eq = vi.fn(() => query)
            query.order = vi.fn(() => query)
            query.then = (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: transportRows, error: null }).then(resolve)
            return query
          }),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async (_col: string, requestId: string) => {
                transportUpdates.push({ requestId, payload })
                return { error: null }
              }),
            })),
          })),
        }
      }
      if (table === "booking_vehicle_rental_details") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (_col: string, requestId: string) => {
              rentalUpdates.push({ requestId, payload })
              return { error: null }
            }),
          })),
        }
      }
      if (table === "vouchers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: state.voucher ?? null, error: null })),
                })),
              })),
            })),
          })),
        }
      }
      if (table === "quote_line_items") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: state.quoteLineItems ?? [], error: null })),
          })),
        }
      }
      if (table === "quotes") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: state.acceptedQuote ?? null, error: null })),
                  })),
                })),
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, serviceUpdates, transportUpdates, rentalUpdates }
}

function mockAuthUser(state: MockState = {}) {
  const built = buildSupabase(state)
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: { supabase: built.supabase, user: { id: "u1", email: "u@example.com" } },
  })
  return built
}

function mockAuthRole(state: MockState = {}) {
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

describe("GET /api/jobs/[id]/movement-times", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(401)
  })

  it("lists flights and transfers with their times", async () => {
    mockAuthUser()
    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.rows.map((row: { key: string }) => row.key)).toEqual([
      `service:${FLIGHT_LEG}`,
      `transport_request:${TRANSPORT_ID}`,
    ])
    expect(body.rows[0]).toMatchObject({ movementType: "flight", departureTime: "10:00", arrivalTime: "12:15" })
  })

  it("reports no staleness when the booking has no voucher", async () => {
    mockAuthUser()
    const body = await (await GET(new Request("http://localhost"), makeParams())).json()
    expect(body.voucher).toEqual({ generatedAt: null, sentAt: null, stale: false })
  })

  it("flags the voucher stale once a movement was re-timed after it was generated", async () => {
    mockAuthUser({ voucher: { generated_at: "2026-08-17T08:00:00.000Z", sent_at: null } })
    const body = await (await GET(new Request("http://localhost"), makeParams())).json()
    expect(body.voucher.stale).toBe(true)
  })

  it("leaves a voucher generated after the last edit alone", async () => {
    mockAuthUser({ voucher: { generated_at: "2026-08-17T12:00:00.000Z", sent_at: null } })
    const body = await (await GET(new Request("http://localhost"), makeParams())).json()
    expect(body.voucher.stale).toBe(false)
  })
})

describe("PATCH /api/jobs/[id]/movement-times", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
    tripDateMocks.recomputeBookingTripDates.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ updates: [{ kind: "service", id: FLIGHT_LEG, departureTime: "11:20" }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("re-times a flight on a booking whose quote is already accepted, without a 409", async () => {
    // The whole point of this route: a reschedule after acceptance must not need a quote revision.
    const { serviceUpdates } = mockAuthRole({
      acceptedQuote: { id: "quote-1", quote_number: "LTT-2026-0001-Q1" },
      quoteLineItems: [{ pricing_snapshot: { legId: FLIGHT_LEG } }],
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [{ kind: "service", id: FLIGHT_LEG, departureTime: "11:20", arrivalTime: "13:35" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(serviceUpdates).toEqual([
      { serviceId: FLIGHT_LEG, payload: { departure_time: "11:20", arrival_time: "13:35" } },
    ])
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "movement_times_updated" }),
    )
    expect(tripDateMocks.recomputeBookingTripDates).toHaveBeenCalled()
  })

  it("uppercases airport codes", async () => {
    const { serviceUpdates } = mockAuthRole()
    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [
            { kind: "service", id: FLIGHT_LEG, departureAirportCode: "hla", arrivalAirportCode: "cpt" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(serviceUpdates[0].payload).toEqual({
      departure_airport_code: "HLA",
      arrival_airport_code: "CPT",
    })
  })

  it("refuses flight times on a non-airline leg", async () => {
    mockAuthRole({ serviceKinds: { [HOTEL_LEG]: "hotel_property" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ updates: [{ kind: "service", id: HOTEL_LEG, departureTime: "10:00" }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only available on airline services/)
  })

  it("refuses an arrival before the stored departure date", async () => {
    mockAuthRole({ serviceDates: { [FLIGHT_LEG]: "2026-10-14" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ updates: [{ kind: "service", id: FLIGHT_LEG, arrivalDate: "2026-10-13" }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/cannot arrive before it departs/)
  })

  it("writes a transfer pickup as an instant and leaves the rest of the set alone", async () => {
    const { transportUpdates, rentalUpdates } = mockAuthRole()
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [
            { kind: "transport_request", id: TRANSPORT_ID, pickupAt: "2026-10-14T13:30:00+02:00" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(transportUpdates).toEqual([
      { requestId: TRANSPORT_ID, payload: { pickup_at: "2026-10-14T13:30:00+02:00" } },
    ])
    // No return was sent, so the rental detail row is not touched — a transfer has none.
    expect(rentalUpdates).toEqual([])
  })

  it("writes a rental return to its own detail row", async () => {
    const { rentalUpdates } = mockAuthRole()
    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [
            { kind: "transport_request", id: TRANSPORT_ID, returnAt: "2026-10-18T09:30:00+02:00" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(rentalUpdates).toEqual([
      { requestId: TRANSPORT_ID, payload: { return_at: "2026-10-18T09:30:00+02:00" } },
    ])
  })

  it("returns 400 for an empty updates array", async () => {
    mockAuthRole()
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ updates: [] }) }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })
})
