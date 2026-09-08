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
const UNIT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1"
const UNIT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  validServiceIds?: string[]
  serviceKinds?: Record<string, string>
  serviceNames?: Record<string, string>
  /** bookings.primary_supplier_id -- the supplier whose leg is the core one. Null falls back to
   *  the train rule; see isCoreBookingLeg. */
  primarySupplierId?: string | null
  /** booking_services.service_date as stored — the departure date a flight's arrival is checked
   * against when the payload omits serviceDate. */
  serviceDates?: Record<string, string | null>
  bookingExists?: boolean
  noOfAdults?: number
  noOfChildren?: number
  childAges?: number[]
  allowedBedroomTypes?: Array<{ suite_type_id: string; bedroom_type_id: string }>
  /** booking_services.updated_at as stored — the optimistic-lock token. */
  serviceUpdatedAt?: string
  /** Stored rooms, read back to carry a room override's provenance across the replace-set. */
  existingUnits?: Array<{
    id: string
    manual_room_price?: number | null
    manual_room_price_set_at?: string | null
    manual_room_price_set_by?: string | null
    manual_tour_price?: number | null
    manual_tour_price_set_at?: string | null
    manual_tour_price_set_by?: string | null
  }>
  /** Rows the GET's services-with-supplier select returns, embedded join included. */
  getServiceRows?: Array<Record<string, unknown>>
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
                    // The booking's core leg. Null keeps the pre-existing train rule, which is
                    // what every case in this file exercises unless it says otherwise.
                    primary_supplier_id: state.primarySupplierId ?? null,
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
            if (columns.includes("suppliers(kind, name)")) {
              return {
                eq: vi.fn(() => ({
                  in: vi.fn(async () => ({
                    data: (state.validServiceIds ?? [SERVICE_A, SERVICE_B]).map((serviceId) => ({
                      id: serviceId,
                      supplier_id: `${serviceId}-supplier`,
                      updated_at: state.serviceUpdatedAt ?? "2026-08-14T10:00:00.000Z",
                      service_date: state.serviceDates?.[serviceId] ?? null,
                      suppliers: {
                        kind: state.serviceKinds?.[serviceId] ?? "train_operator",
                        name: state.serviceNames?.[serviceId] ?? "The Blue Train",
                      },
                    })),
                    error: null,
                  })),
                })),
              }
            }
            // GET / reload: services-with-units select. GET chains .order("sort_order") off .eq()
            // so step 1's list agrees with the leg order step 2 renders; the PATCH reload awaits
            // .eq() directly. The query object has to be both chainable and awaitable.
            const rows = columns.includes("suppliers(name, kind)") ? state.getServiceRows ?? [] : []
            return {
              eq: vi.fn(() => {
                const query: Record<string, unknown> = {}
                query.order = vi.fn(async () => ({ data: rows, error: null }))
                query.then = (resolve: (value: unknown) => unknown) =>
                  Promise.resolve({ data: [], error: null }).then(resolve)
                return query
              }),
            }
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
          // Read back before the replace-set so an untouched room override keeps its original
          // set_at/set_by instead of being re-dated by an unrelated save.
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: state.existingUnits ?? [], error: null })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_col: string, serviceId: string) => {
              unitDeletes.push(serviceId)
              return { error: null }
            }),
            in: vi.fn(async (_col: string, serviceIds: string[]) => {
              unitDeletes.push(...serviceIds)
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

  // Build Booking's step 1 renders its service list off this response rather than waiting on the
  // far heavier GET /build-booking payload, so the supplier's name and kind have to arrive here.
  it("flattens the embedded supplier join onto each selection", async () => {
    mockAuth({
      getServiceRows: [
        {
          id: SERVICE_A,
          supplier_id: "sup-a",
          sort_order: 0,
          units: [],
          suppliers: { name: "Rovos Rail", kind: "train_operator" },
        },
      ],
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    const body = await res.json()

    expect(body.packageId).toBe(BOOKING_ID)
    expect(body.selections[0]).toMatchObject({
      package_leg_id: SERVICE_A,
      sort_order: 0,
      supplier_name: "Rovos Rail",
      supplier_kind: "train_operator",
    })
    // Flattened to scalars, never passed through as a nested object -- every existing consumer of
    // `selections` reads flat snake_case fields.
    expect(body.selections[0]).not.toHaveProperty("suppliers")
  })

  // PostgREST has shipped an embedded to-one relation as a single-element array in the past.
  it("normalises a supplier join that arrives as an array", async () => {
    mockAuth({
      getServiceRows: [
        {
          id: SERVICE_A,
          supplier_id: "sup-a",
          sort_order: 0,
          units: [],
          suppliers: [{ name: "The Blue Train", kind: "train_operator" }],
        },
      ],
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    const body = await res.json()
    expect(body.selections[0].supplier_name).toBe("The Blue Train")
  })

  it("nulls the supplier fields when the join resolves to nothing", async () => {
    mockAuth({
      getServiceRows: [{ id: SERVICE_A, supplier_id: "sup-a", sort_order: 0, units: [], suppliers: null }],
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    const body = await res.json()
    expect(body.selections[0].supplier_name).toBeNull()
    expect(body.selections[0].supplier_kind).toBeNull()
  })

  // F-P1-3 (the select-string half): this handler's response-shaping code just forwards whatever
  // the query returns (see the .map(({ suppliers, ...row }) => ...) below), so it was never what
  // dropped manual_tour_price -- the select string itself was. That half is covered directly in
  // lib/packages/service-columns.test.ts, which can assert against the actual column list; this
  // mock harness returns getServiceRows verbatim and cannot simulate postgrest's projection.
  it("passes a unit's manual price override straight through, whatever columns the query returns", async () => {
    mockAuth({
      getServiceRows: [
        {
          id: SERVICE_A,
          supplier_id: "sup-a",
          sort_order: 0,
          suppliers: { name: "City Sightseeing Bus Tours", kind: "tour_operator" },
          units: [{ id: UNIT_A, manual_tour_price: 1650, manual_tour_price_set_at: "2026-09-04T10:00:00.000Z" }],
        },
      ],
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    const body = await res.json()
    expect(body.selections[0].units[0]).toMatchObject({
      manual_tour_price: 1650,
      manual_tour_price_set_at: "2026-09-04T10:00:00.000Z",
    })
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

  it("rejects a room price override on a non-hotel service", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "train_operator" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              units: [{ suiteTypeId: SUITE_A, adultCount: 2, childCount: 1, manualRoomPrice: 3600 }],
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only available on hotel services/)
  })

  it("rejects a tour price override on a non-tour service", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "train_operator" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              units: [{ suiteTypeId: SUITE_A, adultCount: 2, childCount: 1, manualTourPrice: 2000 }],
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only available on tour services/)
  })

  it("persists a flight schedule on an airline service, uppercasing the airport codes", async () => {
    const built = mockAuth({
      validServiceIds: [SERVICE_A],
      serviceKinds: { [SERVICE_A]: "airline" },
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              serviceDate: "2026-10-14",
              departureTime: "10:00",
              arrivalDate: "2026-10-14",
              arrivalTime: "12:15",
              flightNumber: "FA212",
              departureAirportCode: "hla",
              arrivalAirportCode: "cpt",
              handLuggageKg: 7,
              checkedLuggageKg: 23,
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls[0].payload).toMatchObject({
      service_date: "2026-10-14",
      departure_time: "10:00",
      arrival_date: "2026-10-14",
      arrival_time: "12:15",
      flight_number: "FA212",
      departure_airport_code: "HLA",
      arrival_airport_code: "CPT",
      hand_luggage_kg: 7,
      checked_luggage_kg: 23,
    })
  })

  it("rejects flight schedule fields on a non-airline service", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "hotel_property" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, departureTime: "10:00" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only available on airline services/)
  })

  it("persists the luggage-storage flag on a hotel service", async () => {
    const built = mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "hotel_property" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, luggageStorageAvailable: true }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls[0].payload).toMatchObject({ luggage_storage_available: true })
  })

  it("rejects the luggage-storage flag on a non-hotel service", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "train_operator" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, luggageStorageAvailable: true }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only available on hotel services/)
  })

  it("persists a per-stay pricing basis on a hotel service", async () => {
    const built = mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "hotel_property" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, accommodationPricingBasis: "per_room" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls[0].payload).toMatchObject({ accommodation_pricing_basis: "per_room" })
  })

  it("rejects a pricing basis on a non-hotel service", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "train_operator" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, accommodationPricingBasis: "per_room" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/only available on hotel services/)
  })

  it("rejects an arrival date before the departure date", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "airline" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            { packageLegId: SERVICE_A, serviceDate: "2026-10-14", arrivalDate: "2026-10-13" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/cannot arrive before it departs/)
  })

  it("rejects a same-day arrival at or before the departure time", async () => {
    mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "airline" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              serviceDate: "2026-10-14",
              departureTime: "12:15",
              arrivalDate: "2026-10-14",
              arrivalTime: "10:00",
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/must arrive after it departs/)
  })

  it("checks an arrival date against the stored departure date when the payload omits it", async () => {
    mockAuth({
      validServiceIds: [SERVICE_A],
      serviceKinds: { [SERVICE_A]: "airline" },
      serviceDates: { [SERVICE_A]: "2026-10-14" },
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: SERVICE_A, arrivalDate: "2026-10-12" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/cannot arrive before it departs/)
  })

  it("accepts an overnight flight", async () => {
    const built = mockAuth({ validServiceIds: [SERVICE_A], serviceKinds: { [SERVICE_A]: "airline" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              serviceDate: "2026-10-14",
              departureTime: "22:40",
              arrivalDate: "2026-10-15",
              arrivalTime: "06:15",
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls[0].payload).toMatchObject({ arrival_date: "2026-10-15", arrival_time: "06:15" })
  })

  it("stamps who set a hotel room override and when, and leaves an unchanged one alone", async () => {
    const built = mockAuth({
      validServiceIds: [SERVICE_A],
      serviceKinds: { [SERVICE_A]: "hotel_property" },
      existingUnits: [
        {
          id: UNIT_A,
          manual_room_price: 3600,
          manual_room_price_set_at: "2026-08-01T08:00:00.000Z",
          manual_room_price_set_by: "someone-else",
        },
        {
          id: UNIT_B,
          manual_room_price: 4200,
          manual_room_price_set_at: "2026-08-01T08:00:00.000Z",
          manual_room_price_set_by: "someone-else",
        },
      ],
    })

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              units: [
                // Hotel rooms carry occupancy now (rates are per person per night), and it has to
                // reconcile against the booking's travellers like any other sleeping slot.
                // Untouched: keeps the original stamp.
                { id: UNIT_A, suiteTypeId: SUITE_A, manualRoomPrice: 3600, adultCount: 2 },
                // Changed: re-stamped with this save's actor.
                { id: UNIT_B, suiteTypeId: SUITE_A, manualRoomPrice: 5000, childCount: 1 },
              ],
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const [untouched, changed] = built.unitInserts
    expect(untouched.manual_room_price).toBe(3600)
    expect(untouched.manual_room_price_set_at).toBe("2026-08-01T08:00:00.000Z")
    expect(untouched.manual_room_price_set_by).toBe("someone-else")
    expect(changed.manual_room_price).toBe(5000)
    expect(changed.manual_room_price_set_at).not.toBe("2026-08-01T08:00:00.000Z")
    expect(changed.manual_room_price_set_by).toBe("u1")
  })

  it("clears a room override's provenance when the override is removed", async () => {
    const built = mockAuth({
      validServiceIds: [SERVICE_A],
      serviceKinds: { [SERVICE_A]: "hotel_property" },
      existingUnits: [
        {
          id: UNIT_A,
          manual_room_price: 3600,
          manual_room_price_set_at: "2026-08-01T08:00:00.000Z",
          manual_room_price_set_by: "someone-else",
        },
      ],
    })

    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              units: [
                { id: UNIT_A, suiteTypeId: SUITE_A, manualRoomPrice: null, adultCount: 2, childCount: 1 },
              ],
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(built.unitInserts[0].manual_room_price).toBeNull()
    expect(built.unitInserts[0].manual_room_price_set_at).toBeNull()
    expect(built.unitInserts[0].manual_room_price_set_by).toBeNull()
  })

  it("stamps who set a tour price override and when, and leaves an unchanged one alone", async () => {
    const built = mockAuth({
      validServiceIds: [SERVICE_A],
      serviceKinds: { [SERVICE_A]: "tour_operator" },
      // Tours are passenger-split; zeroed booking totals match the units' default zero counts
      // below so the sum-mismatch guard doesn't fire — irrelevant to what this test checks.
      noOfAdults: 0,
      noOfChildren: 0,
      childAges: [],
      existingUnits: [
        {
          id: UNIT_A,
          manual_tour_price: 2000,
          manual_tour_price_set_at: "2026-08-01T08:00:00.000Z",
          manual_tour_price_set_by: "someone-else",
        },
        {
          id: UNIT_B,
          manual_tour_price: 2500,
          manual_tour_price_set_at: "2026-08-01T08:00:00.000Z",
          manual_tour_price_set_by: "someone-else",
        },
      ],
    })

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: SERVICE_A,
              units: [
                // Untouched: keeps the original stamp.
                { id: UNIT_A, suiteTypeId: SUITE_A, manualTourPrice: 2000 },
                // Changed: re-stamped with this save's actor.
                { id: UNIT_B, suiteTypeId: SUITE_A, manualTourPrice: 3000 },
              ],
            },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const [untouched, changed] = built.unitInserts
    expect(untouched.manual_tour_price).toBe(2000)
    expect(untouched.manual_tour_price_set_at).toBe("2026-08-01T08:00:00.000Z")
    expect(untouched.manual_tour_price_set_by).toBe("someone-else")
    expect(changed.manual_tour_price).toBe(3000)
    expect(changed.manual_tour_price_set_at).not.toBe("2026-08-01T08:00:00.000Z")
    expect(changed.manual_tour_price_set_by).toBe("u1")
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

  it("409s when a leg was changed by someone else since it was read (F10-5)", async () => {
    const built = mockAuth({ serviceUpdatedAt: "2026-08-14T10:00:00.000Z" })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            { packageLegId: SERVICE_A, expectedUpdatedAt: "2026-08-14T09:00:00.000Z", notes: "TAB-A note" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe("STALE_VERSION")
    expect(body.packageLegId).toBe(SERVICE_A)
    expect(body.currentUpdatedAt).toBe("2026-08-14T10:00:00.000Z")
    expect(built.updateCalls).toHaveLength(0)
  })

  it("accepts the write when the expected version still matches", async () => {
    const built = mockAuth({ serviceUpdatedAt: "2026-08-14T10:00:00.000Z" })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            { packageLegId: SERVICE_A, expectedUpdatedAt: "2026-08-14T10:00:00.000Z", notes: "TAB-A note" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls).toContainEqual({
      serviceId: SERVICE_A,
      payload: expect.objectContaining({ notes: "TAB-A note" }),
    })
  })

  it("keeps last-write-wins for a client that sends no version", async () => {
    const built = mockAuth({ serviceUpdatedAt: "2026-08-14T10:00:00.000Z" })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: SERVICE_A, notes: "TAB-B note" }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls).toHaveLength(1)
  })

  it("refuses to deselect the train leg — it is priced either way (F10-7)", async () => {
    const built = mockAuth({ serviceKinds: { [SERVICE_A]: "train_operator" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: SERVICE_A, selected: false }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cannot be excluded/i)
    expect(built.updateCalls).toHaveLength(0)
  })

  // A standalone hotel booking (Kruger Shalati) has no train at all: its hotel leg IS the booking
  // and gets the same protection the train leg has always had.
  it("refuses to deselect the hotel leg of a standalone stay", async () => {
    const built = mockAuth({
      serviceKinds: { [`${SERVICE_A}`]: "hotel_property" },
      serviceNames: { [`${SERVICE_A}`]: "Kruger Shalati - Train on the Bridge" },
      primarySupplierId: `${SERVICE_A}-supplier`,
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: SERVICE_A, selected: false }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/Kruger Shalati/i)
    expect(built.updateCalls).toHaveLength(0)
  })

  it("still allows an add-on hotel leg to be deselected", async () => {
    const built = mockAuth({ serviceKinds: { [SERVICE_A]: "hotel_property" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: SERVICE_A, selected: false }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.updateCalls).toContainEqual({
      serviceId: SERVICE_A,
      payload: expect.objectContaining({ selected: false }),
    })
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
