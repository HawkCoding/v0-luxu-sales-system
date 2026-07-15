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

const helperMocks = vi.hoisted(() => ({
  loadPackageDetail: vi.fn(async () => ({ detail: { id: "pkg", legs: [] } })),
  makeUuid: vi.fn(),
  resolveUniquePackageSlug: vi.fn(async (_supabase: unknown, name: string) => `slug-for-${name}`),
}))

vi.mock("@/app/api/packages/[slug]/helpers", () => ({
  loadPackageDetail: helperMocks.loadPackageDetail,
  makeUuid: helperMocks.makeUuid,
  resolveUniquePackageSlug: helperMocks.resolveUniquePackageSlug,
}))

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const EXISTING_PACKAGE_ID = "00000000-0000-4000-8000-000000000010"
const SUPPLIER_A = "00000000-0000-4000-8000-0000000000b1"
const SUPPLIER_B = "00000000-0000-4000-8000-0000000000b2"
const LEG_A = "00000000-0000-4000-8000-0000000000a1"
const NEW_LEG_ID_1 = "00000000-0000-4000-8000-0000000000e1"
const NEW_LEG_ID_2 = "00000000-0000-4000-8000-0000000000e2"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockRoute {
  id: string
  supplier_id: string
}

interface MockState {
  bookingExists?: boolean
  existingPackage?: { id: string; slug: string } | null
  existingLegs?: { id: string; supplier_id: string; sort_order: number }[]
  routes?: MockRoute[]
}

function buildSupabase(state: MockState) {
  const packageInsert = vi.fn((rows: unknown) => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: { id: "new-package-id", slug: (rows as { slug: string }).slug },
        error: null,
      })),
    })),
  }))
  const legInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  const legDelete = vi.fn(async () => ({ error: null }))
  const legUpdate = vi.fn(async () => ({ error: null }))
  const legRouteInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  const legRouteDelete = vi.fn(async () => ({ error: null }))
  const transportDelete = vi.fn(async () => ({ error: null }))
  const bookingUpdate = vi.fn(async () => ({ error: null }))
  const selectionsInsert = vi.fn((rows: unknown[]) => ({
    select: vi.fn(async () => ({
      data: (rows as Array<{ package_leg_id: string }>).map((row, index) => ({
        id: `selection-${index}`,
        package_leg_id: row.package_leg_id,
      })),
      error: null,
    })),
  }))
  const unitInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                state.bookingExists === false
                  ? { data: null, error: null }
                  : { data: { id: BOOKING_ID, booking_number: "BT-2026-0001", package_id: null }, error: null },
              ),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => bookingUpdate()),
          })),
        }
      }

      if (table === "packages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: state.existingPackage ?? null,
                error: null,
              })),
            })),
          })),
          insert: vi.fn((rows: unknown) => packageInsert(rows)),
        }
      }

      if (table === "package_legs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: state.existingLegs ?? [],
              error: null,
            })),
          })),
          insert: vi.fn((rows: unknown[]) => legInsert(rows)),
          delete: vi.fn(() => ({
            in: vi.fn(() => legDelete()),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => legUpdate()),
          })),
        }
      }

      if (table === "package_leg_routes") {
        return {
          insert: vi.fn((rows: unknown[]) => legRouteInsert(rows)),
          delete: vi.fn(() => ({
            in: vi.fn(() => legRouteDelete()),
          })),
        }
      }

      if (table === "suppliers") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                { id: SUPPLIER_A, name: "Rovos Rail" },
                { id: SUPPLIER_B, name: "Cape Grace" },
              ],
              error: null,
            })),
          })),
        }
      }

      if (table === "routes") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: state.routes ?? [], error: null })),
          })),
        }
      }

      if (table === "booking_transport_requests") {
        return {
          delete: vi.fn(() => ({
            in: vi.fn(() => transportDelete()),
          })),
          insert: vi.fn((rows: unknown[]) => ({
            select: vi.fn(async () => ({
              data: (rows as Array<{ service_type: string }>).map((row, index) => ({
                id: `transport-${index}`,
                service_type: row.service_type,
              })),
              error: null,
            })),
          })),
        }
      }

      if (table === "booking_package_selections") {
        return {
          insert: vi.fn((rows: unknown[]) => selectionsInsert(rows)),
        }
      }

      if (table === "booking_package_selection_units") {
        return {
          insert: vi.fn((rows: unknown[]) => unitInsert(rows)),
        }
      }

      if (table === "booking_vehicle_rental_details") {
        return {
          insert: vi.fn(async (_rows?: unknown) => ({ error: null })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    supabase,
    packageInsert,
    legInsert,
    legDelete,
    legUpdate,
    legRouteInsert,
    legRouteDelete,
    bookingUpdate,
    selectionsInsert,
    unitInsert,
  }
}

function mockAuth(state: MockState) {
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

describe("POST /api/jobs/[id]/build-booking", () => {
  let uuidCounter = 0

  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
    helperMocks.loadPackageDetail.mockClear()
    helperMocks.resolveUniquePackageSlug.mockClear()
    uuidCounter = 0
    helperMocks.makeUuid.mockImplementation(() => {
      uuidCounter += 1
      return uuidCounter === 1 ? NEW_LEG_ID_1 : NEW_LEG_ID_2
    })
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
          tripStartDate: "2026-08-15",
          tripEndDate: "2026-08-20",
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when no services are provided", async () => {
    mockAuth({})
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ services: [] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when booking does not exist", async () => {
    mockAuth({ bookingExists: false })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
          tripStartDate: "2026-08-15",
          tripEndDate: "2026-08-20",
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(404)
  })

  it("creates a hidden package and seeds selections on first build", async () => {
    const built = mockAuth({
      existingPackage: null,
      existingLegs: [],
      routes: [{ id: "route-1", supplier_id: SUPPLIER_A }],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
          tripStartDate: "2026-08-15",
          tripEndDate: "2026-08-20",
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packageId).toBe("new-package-id")
    expect(built.packageInsert).toHaveBeenCalledWith(
      expect.objectContaining({ booking_id: BOOKING_ID, active: false }),
    )
    expect(built.legInsert).toHaveBeenCalledWith([
      expect.objectContaining({ id: NEW_LEG_ID_1, supplier_id: SUPPLIER_A, label: "Rovos Rail" }),
    ])
    expect(built.legRouteInsert).toHaveBeenCalledWith([
      expect.objectContaining({ package_leg_id: NEW_LEG_ID_1, route_id: "route-1" }),
    ])
    expect(built.bookingUpdate).toHaveBeenCalled()
    expect(built.selectionsInsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ package_leg_id: NEW_LEG_ID_1, supplier_id: SUPPLIER_A })]),
    )
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_services_built" }),
    )
  })

  it("reuses the existing hidden package on a second build instead of creating a new one", async () => {
    const built = mockAuth({
      existingPackage: { id: EXISTING_PACKAGE_ID, slug: "booking-bt-2026-0001" },
      existingLegs: [{ id: LEG_A, supplier_id: SUPPLIER_A, sort_order: 0 }],
      routes: [{ id: "route-2", supplier_id: SUPPLIER_B }],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [
            { legId: LEG_A, supplierId: SUPPLIER_A, supplierKind: "train_operator" },
            { supplierId: SUPPLIER_B, supplierKind: "hotel_property" },
          ],
          tripStartDate: "2026-08-15",
          tripEndDate: "2026-08-20",
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packageId).toBe(EXISTING_PACKAGE_ID)
    expect(built.packageInsert).not.toHaveBeenCalled()
    // Only the new hotel leg is inserted; the kept train leg is untouched.
    expect(built.legInsert).toHaveBeenCalledWith([
      expect.objectContaining({ supplier_id: SUPPLIER_B, label: "Cape Grace" }),
    ])
    expect(built.legDelete).not.toHaveBeenCalled()
  })

  it("removes legs that are no longer in the requested services", async () => {
    const LEG_REMOVED = "00000000-0000-4000-8000-0000000000f1"
    const built = mockAuth({
      existingPackage: { id: EXISTING_PACKAGE_ID, slug: "booking-bt-2026-0001" },
      existingLegs: [
        { id: LEG_A, supplier_id: SUPPLIER_A, sort_order: 0 },
        { id: LEG_REMOVED, supplier_id: SUPPLIER_B, sort_order: 1 },
      ],
      routes: [],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ legId: LEG_A, supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
          tripStartDate: "2026-08-15",
          tripEndDate: "2026-08-20",
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.legDelete).toHaveBeenCalled()
    expect(built.legRouteDelete).toHaveBeenCalled()
  })
})
