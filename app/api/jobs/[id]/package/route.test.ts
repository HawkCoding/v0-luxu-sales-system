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

import { POST } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const PACKAGE_ID = "00000000-0000-4000-8000-000000000010"
const LEG_A = "00000000-0000-4000-8000-0000000000a1"
const LEG_B = "00000000-0000-4000-8000-0000000000a2"
const SUPPLIER_A = "00000000-0000-4000-8000-0000000000b1"
const SUPPLIER_B = "00000000-0000-4000-8000-0000000000b2"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockLeg {
  id: string
  supplier_id: string
  sort_order: number
  kind?: string
}

interface MockState {
  bookingPackageId: string | null
  tripStartDate?: string | null
  tripEndDate?: string | null
  legs?: MockLeg[]
  bookingExists?: boolean
}

function buildSupabase(state: MockState) {
  const selectionsInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  const selectionsDelete = vi.fn(async () => ({ error: null }))
  const bookingUpdate = vi.fn(async () => ({ error: null }))
  const transportDelete = vi.fn(async () => ({ error: null }))
  const transportInsert = vi.fn((rows: unknown[]) => ({
    select: vi.fn(async () => ({
      data: (rows as Array<{ service_type: string }>).map((row, index) => ({
        id: `transport-${index}`,
        service_type: row.service_type,
      })),
      error: null,
    })),
  }))
  const rentalInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  const unitInsert = vi.fn(async (_rows?: unknown) => ({ error: null }))
  let lastSelectionRows: unknown[] = []

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
                        package_id: state.bookingPackageId,
                        trip_start_date: state.tripStartDate ?? null,
                        trip_end_date: state.tripEndDate ?? null,
                      },
                      error: null,
                    },
              ),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn((..._args: unknown[]) => bookingUpdate()),
          })),
        }
      }

      if (table === "booking_package_selections") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => selectionsDelete()),
          })),
          insert: vi.fn((rows: unknown[]) => {
            lastSelectionRows = rows as unknown[]
            selectionsInsert(rows)
            return {
              select: vi.fn(async () => ({
                data: (rows as Array<{ package_leg_id: string }>).map((row, index) => ({
                  id: `selection-${index}`,
                  package_leg_id: row.package_leg_id,
                })),
                error: null,
              })),
            }
          }),
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: lastSelectionRows, error: null })),
          })),
        }
      }

      if (table === "booking_package_selection_units") {
        return {
          insert: vi.fn((rows: unknown[]) => unitInsert(rows)),
        }
      }

      if (table === "package_legs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: (state.legs ?? []).map((leg) => ({
                  id: leg.id,
                  supplier_id: leg.supplier_id,
                  sort_order: leg.sort_order,
                  supplier: leg.kind ? { kind: leg.kind } : null,
                })),
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "booking_transport_requests") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => transportDelete()),
            })),
          })),
          insert: vi.fn((rows: unknown[]) => transportInsert(rows)),
        }
      }

      if (table === "booking_vehicle_rental_details") {
        return {
          insert: vi.fn((rows: unknown[]) => rentalInsert(rows)),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    supabase,
    selectionsInsert,
    selectionsDelete,
    bookingUpdate,
    transportDelete,
    transportInsert,
    rentalInsert,
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

describe("POST /api/jobs/[id]/package", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, tripStartDate: "2026-08-15", tripEndDate: "2026-08-20" }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid JSON", async () => {
    mockAuth({ bookingPackageId: null })
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "not json" }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when booking does not exist", async () => {
    mockAuth({ bookingPackageId: null, bookingExists: false })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, tripStartDate: "2026-08-15", tripEndDate: "2026-08-20" }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(404)
  })

  it("returns 400 when assigning a package without a trip date range", async () => {
    mockAuth({ bookingPackageId: null })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 when trip end date is before trip start date", async () => {
    mockAuth({ bookingPackageId: null })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, tripStartDate: "2026-08-20", tripEndDate: "2026-08-15" }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("seeds one selection per package leg when assigning a package", async () => {
    const { selectionsInsert, selectionsDelete, unitInsert } = mockAuth({
      bookingPackageId: null,
      legs: [
        { id: LEG_A, supplier_id: SUPPLIER_A, sort_order: 0 },
        { id: LEG_B, supplier_id: SUPPLIER_B, sort_order: 1 },
      ],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, tripStartDate: "2026-08-15", tripEndDate: "2026-08-20" }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tripStartDate).toBe("2026-08-15")
    expect(body.tripEndDate).toBe("2026-08-20")
    expect(selectionsDelete).toHaveBeenCalled()
    expect(selectionsInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking_id: BOOKING_ID,
          package_leg_id: LEG_A,
          supplier_id: SUPPLIER_A,
          selected: true,
          service_date: "2026-08-15",
        }),
        expect.objectContaining({
          booking_id: BOOKING_ID,
          package_leg_id: LEG_B,
          supplier_id: SUPPLIER_B,
        }),
      ]),
    )
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_package_assigned" }),
    )
    // Both legs default to a non-transport kind (no `kind` set), so each gets one blank unit row.
    expect(unitInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ selection_id: "selection-0" }),
        expect.objectContaining({ selection_id: "selection-1" }),
      ]),
    )
  })

  it("provisions one transport request per transfer/vehicle_rental leg, ignoring train/hotel legs", async () => {
    const SUPPLIER_TRAIN = "00000000-0000-4000-8000-0000000000c1"
    const SUPPLIER_TRANSFER = "00000000-0000-4000-8000-0000000000c2"
    const SUPPLIER_RENTAL = "00000000-0000-4000-8000-0000000000c3"
    const LEG_TRAIN = "00000000-0000-4000-8000-0000000000d1"
    const LEG_TRANSFER = "00000000-0000-4000-8000-0000000000d2"
    const LEG_RENTAL = "00000000-0000-4000-8000-0000000000d3"

    const { transportDelete, transportInsert, rentalInsert, unitInsert } = mockAuth({
      bookingPackageId: null,
      legs: [
        { id: LEG_TRAIN, supplier_id: SUPPLIER_TRAIN, sort_order: 0, kind: "train_operator" },
        { id: LEG_TRANSFER, supplier_id: SUPPLIER_TRANSFER, sort_order: 1, kind: "transfers" },
        { id: LEG_RENTAL, supplier_id: SUPPLIER_RENTAL, sort_order: 2, kind: "vehicle_rental" },
      ],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, tripStartDate: "2026-08-15", tripEndDate: "2026-08-20" }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(transportDelete).toHaveBeenCalled()
    expect(transportInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ package_leg_id: LEG_TRANSFER, service_type: "transfer" }),
        expect.objectContaining({ package_leg_id: LEG_RENTAL, service_type: "rental" }),
      ]),
    )
    expect(transportInsert.mock.calls[0][0]).toHaveLength(2)
    expect(rentalInsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ transport_request_id: "transport-1", return_at: "2026-08-20T00:00:00+00:00" }),
      ]),
    )
    // Only the train leg (index 0, non-transport) gets a seeded unit row.
    expect(unitInsert).toHaveBeenCalledWith([expect.objectContaining({ selection_id: "selection-0" })])
  })

  it("clears selections when packageId is set to null, without requiring trip dates", async () => {
    const { selectionsDelete, selectionsInsert } = mockAuth({
      bookingPackageId: PACKAGE_ID,
      tripStartDate: "2026-08-15",
      tripEndDate: "2026-08-20",
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: null }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(selectionsDelete).toHaveBeenCalled()
    expect(selectionsInsert).not.toHaveBeenCalled()
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "booking_package_cleared" }),
    )
  })

  it("does not re-seed selections when the package is unchanged", async () => {
    const { selectionsDelete, selectionsInsert } = mockAuth({
      bookingPackageId: PACKAGE_ID,
      tripStartDate: "2026-08-15",
      tripEndDate: "2026-08-20",
      legs: [{ id: LEG_A, supplier_id: SUPPLIER_A, sort_order: 0 }],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, tripStartDate: "2026-09-01", tripEndDate: "2026-09-05" }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(selectionsDelete).not.toHaveBeenCalled()
    expect(selectionsInsert).not.toHaveBeenCalled()
  })
})
