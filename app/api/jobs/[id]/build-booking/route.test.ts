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

const adapterMocks = vi.hoisted(() => ({
  loadBookingServicesPackageDetail: vi.fn(async () => ({
    detail: { id: "b1", legs: [] as Array<{ id: string }> },
    services: [] as unknown[],
    units: [] as unknown[],
  })),
}))

vi.mock("@/lib/quotes/adapters/from-booking-services", () => ({
  loadBookingServicesPackageDetail: adapterMocks.loadBookingServicesPackageDetail,
}))

import { POST, GET } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const SUPPLIER_A = "00000000-0000-4000-8000-0000000000b1"
const SUPPLIER_B = "00000000-0000-4000-8000-0000000000b2"
const SERVICE_A = "00000000-0000-4000-8000-0000000000a1"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  bookingExists?: boolean
  existingServices?: { id: string; supplier_id: string; sort_order: number }[]
}

function buildSupabase(state: MockState) {
  const serviceInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  const serviceDelete = vi.fn(async () => ({ error: null }))
  const serviceUpdate = vi.fn(async () => ({ error: null }))
  const transportDelete = vi.fn(async () => ({ error: null }))
  const unitInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  const transportInsert = vi.fn((rows: unknown[]) => ({
    select: vi.fn(async () => ({
      data: (rows as Array<{ service_type: string }>).map((row, index) => ({
        id: `transport-${index}`,
        service_type: row.service_type,
      })),
      error: null,
    })),
  }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () =>
                state.bookingExists === false
                  ? { data: null, error: null }
                  : { data: { id: BOOKING_ID, booking_number: "BT-2026-0001" }, error: null },
              ),
            })),
          })),
        }
      }

      if (table === "booking_services") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: state.existingServices ?? [], error: null })),
          })),
          insert: vi.fn((rows: unknown[]) => serviceInsert(rows)),
          delete: vi.fn(() => ({
            in: vi.fn(() => serviceDelete()),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => serviceUpdate()),
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
            // Age-bucket overrides looked up per leg when seeding unit passenger counts.
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }

      if (table === "booking_transport_requests") {
        return {
          delete: vi.fn(() => ({
            in: vi.fn(() => ({
              // The route selects the deleted rows back so it can report how many went with the leg.
              select: vi.fn(async () => {
                await transportDelete()
                return { data: [{ id: "transport-removed" }], error: null }
              }),
            })),
          })),
          insert: vi.fn((rows: unknown[]) => transportInsert(rows)),
        }
      }

      if (table === "booking_vehicle_rental_details") {
        return {
          insert: vi.fn(async (_rows?: unknown) => ({ error: null })),
        }
      }

      if (table === "booking_service_units") {
        return {
          insert: vi.fn((rows: unknown[]) => unitInsert(rows)),
        }
      }

      // seedUnitsForServices carries the enquiry's captured suite configuration and headcount
      // forward (lib/packages/seed-service-units.ts) -- covered separately in its own test.
      if (
        table === "booking_suites" ||
        table === "suite_types" ||
        table === "bookings" ||
        table === "app_settings"
      ) {
        return {
          select: vi.fn(() => {
            const query: Record<string, unknown> = {}
            query.eq = vi.fn(() => query)
            query.in = vi.fn(() => query)
            query.order = vi.fn(async () => ({ data: [], error: null }))
            query.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
            query.then = (resolve: (value: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(resolve)
            return query
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, serviceInsert, serviceDelete, serviceUpdate, transportDelete, transportInsert, unitInsert }
}

function mockAuth(state: MockState) {
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

describe("POST /api/jobs/[id]/build-booking", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    authMocks.requireUser.mockReset()
    auditMocks.writeAuditLog.mockClear()
    adapterMocks.loadBookingServicesPackageDetail.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when no services are provided", async () => {
    mockAuth({})
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ services: [] }) }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when booking does not exist", async () => {
    mockAuth({ bookingExists: false })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(404)
  })

  it("inserts a new booking_services row directly -- no hidden packages/package_legs involved", async () => {
    const built = mockAuth({ existingServices: [] })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }] }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.serviceInsert).toHaveBeenCalledWith([
      expect.objectContaining({ booking_id: BOOKING_ID, supplier_id: SUPPLIER_A, label: "Rovos Rail", sort_order: 0 }),
    ])
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_services_built" }),
    )
    expect(adapterMocks.loadBookingServicesPackageDetail).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      "BT-2026-0001",
    )
  })

  it("keeps an existing service (matched by legId) and only inserts the newly added one", async () => {
    const built = mockAuth({
      existingServices: [{ id: SERVICE_A, supplier_id: SUPPLIER_A, sort_order: 0 }],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [
            { legId: SERVICE_A, supplierId: SUPPLIER_A, supplierKind: "train_operator" },
            { supplierId: SUPPLIER_B, supplierKind: "hotel_property" },
          ],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.serviceInsert).toHaveBeenCalledWith([
      expect.objectContaining({ supplier_id: SUPPLIER_B, label: "Cape Grace" }),
    ])
    expect(built.serviceDelete).not.toHaveBeenCalled()
  })

  it("removes services that are no longer in the requested list, cascading their transport requests first", async () => {
    const SERVICE_REMOVED = "00000000-0000-4000-8000-0000000000f1"
    const built = mockAuth({
      existingServices: [
        { id: SERVICE_A, supplier_id: SUPPLIER_A, sort_order: 0 },
        { id: SERVICE_REMOVED, supplier_id: SUPPLIER_B, sort_order: 1 },
      ],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ legId: SERVICE_A, supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.transportDelete).toHaveBeenCalled()
    expect(built.serviceDelete).toHaveBeenCalled()
    const body = await res.json()
    expect(body.removedServiceCount).toBe(1)
    expect(body.removedTransportRequestCount).toBe(1)
  })

  it("adopts an existing service when the request omits legId, instead of deleting and re-creating it (F10-4)", async () => {
    const built = mockAuth({
      existingServices: [{ id: SERVICE_A, supplier_id: SUPPLIER_A, sort_order: 0 }],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.serviceDelete).not.toHaveBeenCalled()
    expect(built.transportDelete).not.toHaveBeenCalled()
    expect(built.serviceInsert).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.removedServiceCount).toBe(0)
  })

  it("refuses to guess when two existing services share the supplier and no legId is sent", async () => {
    const SERVICE_A2 = "00000000-0000-4000-8000-0000000000a9"
    const built = mockAuth({
      existingServices: [
        { id: SERVICE_A, supplier_id: SUPPLIER_A, sort_order: 0 },
        { id: SERVICE_A2, supplier_id: SUPPLIER_A, sort_order: 1 },
      ],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/legId/)
    expect(built.serviceDelete).not.toHaveBeenCalled()
    expect(built.serviceInsert).not.toHaveBeenCalled()
  })

  it("still deletes a leg that is genuinely dropped from the list, even when others are adopted", async () => {
    const SERVICE_B = "00000000-0000-4000-8000-0000000000f2"
    const built = mockAuth({
      existingServices: [
        { id: SERVICE_A, supplier_id: SUPPLIER_A, sort_order: 0 },
        { id: SERVICE_B, supplier_id: SUPPLIER_B, sort_order: 1 },
      ],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          services: [{ supplierId: SUPPLIER_A, supplierKind: "train_operator" }],
        }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(built.serviceDelete).toHaveBeenCalled()
    expect(built.serviceInsert).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.removedServiceCount).toBe(1)
  })
})

describe("GET /api/jobs/[id]/build-booking", () => {
  beforeEach(() => {
    adapterMocks.loadBookingServicesPackageDetail.mockClear()
  })

  it("returns a null packageDetail when the booking has no services yet", async () => {
    mockAuth({})
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValueOnce({
      detail: { id: BOOKING_ID, legs: [] },
      services: [],
      units: [],
    })

    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packageDetail).toBeNull()
  })

  it("returns the packageDetail when services exist", async () => {
    mockAuth({})
    const detail = { id: BOOKING_ID, legs: [{ id: SERVICE_A }] }
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValueOnce({
      detail,
      services: [{ id: SERVICE_A }],
      units: [],
    })

    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.packageDetail).toEqual(detail)
  })
})
