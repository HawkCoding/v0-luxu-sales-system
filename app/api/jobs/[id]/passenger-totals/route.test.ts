import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}))

const totalsMock = vi.hoisted(() => ({
  computeLegPassengerTotals: vi.fn(),
  resolveSupplierAgeBuckets: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
}))

vi.mock("@/lib/packages/passenger-totals", () => ({
  computeLegPassengerTotals: totalsMock.computeLegPassengerTotals,
  resolveSupplierAgeBuckets: totalsMock.resolveSupplierAgeBuckets,
}))

import { GET } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const SUPPLIER_A = "00000000-0000-4000-8000-00000000bbbb"
const SUPPLIER_B = "00000000-0000-4000-8000-00000000cccc"

const params = Promise.resolve({ id: BOOKING_ID })

function buildSupabase(booking: unknown = { id: BOOKING_ID, no_of_adults: 2, no_of_children: 2, child_ages: [3, 9] }) {
  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: booking, error: null })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function authOk(supabase: unknown) {
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "u1", email: "u@example.com" },
      profile: { clearanceLevel: "consultant", actorName: "Jane", name: "Jane", surname: "D", email: "u@example.com" },
    },
  })
}

describe("GET /api/jobs/[id]/passenger-totals", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    totalsMock.computeLegPassengerTotals.mockReset()
    totalsMock.resolveSupplierAgeBuckets.mockReset()
    totalsMock.resolveSupplierAgeBuckets.mockResolvedValue({ infantMax: 2, childMax: 12 })
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request(`http://localhost/api/jobs/${BOOKING_ID}/passenger-totals?supplierIds=${SUPPLIER_A}`), { params })
    expect(res.status).toBe(401)
  })

  it("returns 400 when supplierIds is missing or invalid", async () => {
    authOk(buildSupabase())
    const missing = await GET(new Request(`http://localhost/api/jobs/${BOOKING_ID}/passenger-totals`), { params })
    expect(missing.status).toBe(400)

    const invalid = await GET(
      new Request(`http://localhost/api/jobs/${BOOKING_ID}/passenger-totals?supplierIds=not-a-uuid`),
      { params },
    )
    expect(invalid.status).toBe(400)
  })

  it("returns 404 when the booking does not exist", async () => {
    authOk(buildSupabase(null))
    const res = await GET(
      new Request(`http://localhost/api/jobs/${BOOKING_ID}/passenger-totals?supplierIds=${SUPPLIER_A}`),
      { params },
    )
    expect(res.status).toBe(404)
  })

  it("returns totals keyed by supplier id", async () => {
    authOk(buildSupabase())
    totalsMock.computeLegPassengerTotals
      .mockResolvedValueOnce({ adultCount: 2, childCount: 1, infantCount: 1 })
      .mockResolvedValueOnce({ adultCount: 3, childCount: 1, infantCount: 0 })

    const res = await GET(
      new Request(`http://localhost/api/jobs/${BOOKING_ID}/passenger-totals?supplierIds=${SUPPLIER_A},${SUPPLIER_B}`),
      { params },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalsBySupplierId).toEqual({
      [SUPPLIER_A]: { adultCount: 2, childCount: 1, infantCount: 1 },
      [SUPPLIER_B]: { adultCount: 3, childCount: 1, infantCount: 0 },
    })
    expect(body.bucketsBySupplierId).toEqual({
      [SUPPLIER_A]: { infantMax: 2, childMax: 12 },
      [SUPPLIER_B]: { infantMax: 2, childMax: 12 },
    })
    expect(body.booking).toEqual({ noOfAdults: 2, noOfChildren: 2, childAges: [3, 9] })
    expect(totalsMock.computeLegPassengerTotals).toHaveBeenCalledTimes(2)
    expect(totalsMock.computeLegPassengerTotals).toHaveBeenCalledWith(expect.anything(), {
      noOfAdults: 2,
      noOfChildren: 2,
      childAges: [3, 9],
      supplierId: SUPPLIER_A,
    })
  })
})
