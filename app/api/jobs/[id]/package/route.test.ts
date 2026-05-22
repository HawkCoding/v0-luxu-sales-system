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

interface MockState {
  bookingPackageId: string | null
  bookingTravelDate: string | null
  legs?: Array<{ id: string; supplier_id: string; sort_order: number }>
  bookingExists?: boolean
}

function buildSupabase(state: MockState) {
  const selectionsInsert = vi.fn(async () => ({ error: null }))
  const selectionsDelete = vi.fn(async () => ({ error: null }))
  const bookingUpdate = vi.fn(async () => ({ error: null }))
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
                        package_travel_date: state.bookingTravelDate,
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
          insert: vi.fn(async (rows: unknown[]) => {
            lastSelectionRows = rows as unknown[]
            return selectionsInsert()
          }),
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: lastSelectionRows, error: null })),
          })),
        }
      }

      if (table === "package_legs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: state.legs ?? [],
                error: null,
              })),
            })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, selectionsInsert, selectionsDelete, bookingUpdate }
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
        body: JSON.stringify({ packageId: PACKAGE_ID }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid JSON", async () => {
    mockAuth({ bookingPackageId: null, bookingTravelDate: null })
    const res = await POST(
      new Request("http://localhost", { method: "POST", body: "not json" }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when booking does not exist", async () => {
    mockAuth({ bookingPackageId: null, bookingTravelDate: null, bookingExists: false })
    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(404)
  })

  it("seeds one selection per package leg when assigning a package", async () => {
    const { selectionsInsert, selectionsDelete } = mockAuth({
      bookingPackageId: null,
      bookingTravelDate: null,
      legs: [
        { id: LEG_A, supplier_id: SUPPLIER_A, sort_order: 0 },
        { id: LEG_B, supplier_id: SUPPLIER_B, sort_order: 1 },
      ],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, packageTravelDate: "2026-08-15" }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
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
  })

  it("clears selections when packageId is set to null", async () => {
    const { selectionsDelete, selectionsInsert } = mockAuth({
      bookingPackageId: PACKAGE_ID,
      bookingTravelDate: "2026-08-15",
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
      bookingTravelDate: "2026-08-15",
      legs: [{ id: LEG_A, supplier_id: SUPPLIER_A, sort_order: 0 }],
    })

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ packageId: PACKAGE_ID, packageTravelDate: "2026-09-01" }),
      }),
      makeParams(),
    )

    expect(res.status).toBe(200)
    expect(selectionsDelete).not.toHaveBeenCalled()
    expect(selectionsInsert).not.toHaveBeenCalled()
  })
})
