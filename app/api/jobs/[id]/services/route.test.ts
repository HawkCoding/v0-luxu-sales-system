import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: authMocks.requireUser,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { GET, PATCH } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const SERVICE_A = "00000000-0000-4000-8000-0000000000a1"
const SERVICE_B = "00000000-0000-4000-8000-0000000000a2"
const FOREIGN_SERVICE = "00000000-0000-4000-8000-0000000000ff"
const SUITE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  validServiceIds?: string[]
  serviceKinds?: Record<string, string>
  bookingExists?: boolean
  noOfAdults?: number
  noOfChildren?: number
  childAges?: number[]
  allowedBedroomTypes?: Array<{ suite_type_id: string; bedroom_type_id: string }>
}

function buildSupabase(state: MockState = {}) {
  const updateCalls: Array<{ serviceId: string; payload: Record<string, unknown> }> = []
  const unitDeletes: string[] = []
  const unitInserts: Record<string, unknown>[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (state.bookingExists === false) return { data: null, error: null }
                return {
                  data: {
                    id: BOOKING_ID,
                    booking_number: "BT-2026-0001",
                    trip_start_date: null,
                    trip_end_date: null,
                    no_of_adults: state.noOfAdults ?? 2,
                    no_of_children: state.noOfChildren ?? 1,
                    child_ages: state.childAges ?? [6],
                  },
                  error: null,
                }
              }),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        }
      }
      if (table === "booking_services") {
        return {
          select: vi.fn((columns: string) => {
            if (columns.includes("suppliers(kind)")) {
              return {
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({
                    data: (state.validServiceIds ?? [SERVICE_A, SERVICE_B]).map((serviceId) => ({
                      id: serviceId,
                      supplier_id: `${serviceId}-supplier`,
                      suppliers: { kind: state.serviceKinds?.[serviceId] ?? "train_operator" },
                    })),
                    error: null,
                  })),
                })),
              }
            }
            // GET / reload: services-with-units select
            return { eq: vi.fn(async () => ({ data: [], error: null })) }
          }),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async (_col: string, serviceId: string) => {
                updateCalls.push({ serviceId, payload })
                return { error: null }
              }),
            })),
          })),
        }
      }
      if (table === "booking_transport_requests") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "booking_service_units") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async (_col: string, serviceId: string) => {
              unitDeletes.push(serviceId)
              return { error: null }
            }),
          })),
          insert: vi.fn(async (rows: Record<string, unknown>[]) => {
            unitInserts.push(...rows)
            return { error: null }
          }),
        }
      }
      if (
        table === "suite_type_bedroom_types" ||
        table === "suite_type_bedroom_layouts" ||
        table === "suite_type_bathroom_types"
      ) {
        const data = table === "suite_type_bedroom_types" ? state.allowedBedroomTypes ?? [] : []
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data, error: null })) })) }
      }
      if (table === "suppliers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }
      if (table === "app_settings") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      // Alias learning reads the enquiry's captured wording from booking_suites -- nothing was
      // captured in these fixtures, so it no-ops. The learning rules are covered in lib/suites/.
      if (table === "booking_suites" || table === "suite_types") {
        return {
          select: vi.fn(() => {
            const query: Record<string, unknown> = {}
            query.eq = vi.fn(() => query)
            query.in = vi.fn(() => query)
            query.order = vi.fn(async () => ({ data: [], error: null }))
            query.then = (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve)
            return query
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, updateCalls, unitDeletes, unitInserts }
}

function mockAuth(state: MockState = {}) {
  const built = buildSupabase(state)
  const authValue = {
    ok: true as const,
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
  }
  authMocks.requireRole.mockResolvedValue(authValue)
  authMocks.requireUser.mockResolvedValue(authValue)
  return built
}

describe("GET /api/jobs/[id]/services", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 404 when the booking does not exist", async () => {
    mockAuth({ bookingExists: false })
    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(404)
  })

  it("returns packageId: null when the booking has no services yet", async () => {
    mockAuth({})
    const res = await GET(new Request("http://localhost"), makeParams())
    const body = await res.json()
    expect(body.packageId).toBeNull()
    expect(body.selections).toEqual([])
  })
})

describe("PATCH /api/jobs/[id]/services", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: SERVICE_A, selected: true }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 when the booking does not exist", async () => {
    mockAuth({ bookingExists: false })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: SERVICE_A, selected: true }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(404)
  })

  it("rejects a service id that doesn't belong to this booking", async () => {
    mockAuth({ validServiceIds: [SERVICE_A] })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: FOREIGN_SERVICE, selected: true }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details?.invalidServiceIds).toEqual([FOREIGN_SERVICE])
  })

  it("updates leg-level fields directly on booking_services, tagged origin: consultant", async () => {
    const built = mockAuth({})
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              selected: true,
              routeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              serviceDate: "2026-09-01",
            },
          ],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(built.updateCalls).toContainEqual({
      serviceId: SERVICE_A,
      payload: expect.objectContaining({
        selected: true,
        route_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        service_date: "2026-09-01",
        origin: "consultant",
      }),
    })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_services_updated" }),
    )
  })

  it("rejects units on a transfer/rental service", async () => {
    mockAuth({ serviceKinds: { [SERVICE_A]: "transfers" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, units: [{ suiteTypeId: SUITE_A, adultCount: 0, childCount: 0, infantCount: 0 }] }],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("replaces the unit set for a service and learns from the correction", async () => {
    const built = mockAuth({})
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              units: [{ suiteTypeId: SUITE_A, adultCount: 2, childCount: 1, infantCount: 0, sortOrder: 0 }],
            },
          ],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(built.unitDeletes).toContain(SERVICE_A)
    expect(built.unitInserts).toContainEqual(
      expect.objectContaining({ service_id: SERVICE_A, suite_type_id: SUITE_A, adult_count: 2, origin: "consultant" }),
    )
  })

  it("rejects a per-unit passenger split that doesn't sum to the booking's totals", async () => {
    mockAuth({ noOfAdults: 2, noOfChildren: 1, childAges: [6] })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            { packageLegId: SERVICE_A, units: [{ suiteTypeId: SUITE_A, adultCount: 1, childCount: 0, infantCount: 0 }] },
          ],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })
})
