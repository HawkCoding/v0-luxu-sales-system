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

import { PATCH } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const PACKAGE_ID = "00000000-0000-4000-8000-000000000010"
const LEG_A = "00000000-0000-4000-8000-0000000000a1"
const LEG_B = "00000000-0000-4000-8000-0000000000a2"
const FOREIGN_LEG = "00000000-0000-4000-8000-0000000000ff"
const SUITE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const BEDROOM_TWIN = "11111111-1111-4111-8111-111111111111"
const SELECTION_A = "00000000-0000-4000-8000-0000000000e1"
const SELECTION_B = "00000000-0000-4000-8000-0000000000e2"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  packageId?: string | null
  validLegIds?: string[]
  legKinds?: Record<string, string>
  bookingExists?: boolean
  noOfAdults?: number
  noOfChildren?: number
  childAges?: number[]
  allowedBedroomTypes?: Array<{ suite_type_id: string; bedroom_type_id: string }>
}

function buildSupabase(state: MockState = {}) {
  const updateCalls: Array<{ legId: string; payload: Record<string, unknown> }> = []
  const unitDeletes: string[] = []
  const unitInserts: Record<string, unknown>[] = []
  const selectionIdByLegId = new Map<string, string>([
    [LEG_A, SELECTION_A],
    [LEG_B, SELECTION_B],
  ])

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (state.bookingExists === false) return { data: null, error: null }
                const packageId = state.packageId === undefined ? PACKAGE_ID : state.packageId
                return {
                  data: {
                    id: BOOKING_ID,
                    package_id: packageId,
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
      if (table === "package_legs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: (state.validLegIds ?? [LEG_A, LEG_B]).map((legId) => ({
                  id: legId,
                  supplier_id: `${legId}-supplier`,
                  supplier: { kind: state.legKinds?.[legId] ?? "train_operator" },
                })),
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "booking_package_selections") {
        return {
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((_col1: string, _val1: string) => ({
              eq: vi.fn(async (_col2: string, legId: string) => {
                updateCalls.push({ legId, payload })
                return { error: null }
              }),
            })),
          })),
          select: vi.fn((columns: string) => {
            if (columns.includes("units:booking_package_selection_units")) {
              return { eq: vi.fn(async () => ({ data: [], error: null })) }
            }
            // recomputeBookingTripDates: selected/service_date/nights/route_id, resolved directly off .eq()
            if (columns.includes("service_date")) {
              return { eq: vi.fn(async () => ({ data: [], error: null })) }
            }
            return {
              eq: vi.fn(() => ({
                in: vi.fn(async (_col: string, legIds: string[]) => ({
                  data: legIds
                    .filter((legId) => selectionIdByLegId.has(legId))
                    .map((legId) => ({ id: selectionIdByLegId.get(legId), package_leg_id: legId })),
                  error: null,
                })),
              })),
            }
          }),
        }
      }
      if (table === "booking_transport_requests") {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
      }
      if (table === "booking_package_selection_units") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(async (_col: string, selectionId: string) => {
              unitDeletes.push(selectionId)
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
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, updateCalls, unitDeletes, unitInserts }
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

describe("PATCH /api/jobs/[id]/package-selections", () => {
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
        body: JSON.stringify({ selections: [{ packageLegId: LEG_A, selected: false }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when booking has no package", async () => {
    mockAuth({ packageId: null })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: LEG_A, selected: false }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when a selection references a foreign leg", async () => {
    mockAuth({ validLegIds: [LEG_A] })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ selections: [{ packageLegId: FOREIGN_LEG, selected: true }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details?.invalidLegIds).toEqual([FOREIGN_LEG])
  })

  it("applies leg-level updates per selection and audits", async () => {
    const { updateCalls } = mockAuth({ validLegIds: [LEG_A, LEG_B] })

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            { packageLegId: LEG_A, serviceDate: "2026-08-15", notes: "Early check-in" },
            { packageLegId: LEG_B, selected: false },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(2)
    expect(updateCalls[0]).toMatchObject({
      legId: LEG_A,
      payload: { service_date: "2026-08-15", notes: "Early check-in" },
    })
    expect(updateCalls[1]).toMatchObject({
      legId: LEG_B,
      payload: { selected: false },
    })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_package_selections_updated" }),
    )
  })

  it("returns 400 when units are submitted for a transfer/vehicle-rental leg", async () => {
    mockAuth({ validLegIds: [LEG_A], legKinds: { [LEG_A]: "transfers" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: LEG_A, units: [{ suiteTypeId: SUITE_A }] }],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not supported for transfer\/vehicle rental legs/)
  })

  it("returns 400 when a unit's bedroom type isn't associated with its suite type", async () => {
    mockAuth({ validLegIds: [LEG_A], legKinds: { [LEG_A]: "hotel_property" }, allowedBedroomTypes: [] })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: LEG_A, units: [{ suiteTypeId: SUITE_A, bedroomTypeId: BEDROOM_TWIN }] }],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/bedroomTypeId is not available/)
  })

  it("accepts a bedroom type explicitly associated with the suite type", async () => {
    const { unitInserts } = mockAuth({
      validLegIds: [LEG_A],
      legKinds: { [LEG_A]: "hotel_property" },
      allowedBedroomTypes: [{ suite_type_id: SUITE_A, bedroom_type_id: BEDROOM_TWIN }],
    })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: LEG_A, units: [{ suiteTypeId: SUITE_A, bedroomTypeId: BEDROOM_TWIN }] }],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(unitInserts).toContainEqual(
      expect.objectContaining({ selection_id: SELECTION_A, suite_type_id: SUITE_A, bedroom_type_id: BEDROOM_TWIN }),
    )
  })

  it("returns 400 when per-unit passenger counts don't sum to the booking's traveller totals on a train leg", async () => {
    // Default booking mock: 2 adults, 1 child aged 6 -> totals adult=2, child=1, infant=0.
    mockAuth({ validLegIds: [LEG_A], legKinds: { [LEG_A]: "train_operator" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            { packageLegId: LEG_A, units: [{ suiteTypeId: SUITE_A, adultCount: 1, childCount: 0, infantCount: 0 }] },
          ],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/must sum to the booking's traveller totals/)
  })

  it("accepts per-unit passenger counts that sum correctly across multiple units on a train leg", async () => {
    const { unitDeletes, unitInserts } = mockAuth({ validLegIds: [LEG_A], legKinds: { [LEG_A]: "train_operator" } })
    const OTHER_SUITE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [
            {
              packageLegId: LEG_A,
              units: [
                { suiteTypeId: SUITE_A, adultCount: 1, childCount: 1, infantCount: 0 },
                { suiteTypeId: OTHER_SUITE, adultCount: 1, childCount: 0, infantCount: 0 },
              ],
            },
          ],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(unitDeletes).toEqual([SELECTION_A])
    expect(unitInserts).toHaveLength(2)
  })

  it("does not require a passenger split for hotel legs", async () => {
    const { unitInserts } = mockAuth({ validLegIds: [LEG_A], legKinds: { [LEG_A]: "hotel_property" } })
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          selections: [{ packageLegId: LEG_A, units: [{ suiteTypeId: SUITE_A }] }],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(unitInserts).toContainEqual(expect.objectContaining({ suite_type_id: SUITE_A, adult_count: 0 }))
  })
})
