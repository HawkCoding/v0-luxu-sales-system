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
  mapBookingSupplierSchedule: vi.fn((row: { id: string }) => ({ id: row.id })),
}))

import { GET, PUT } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"
const HOTEL_SUPPLIER_ID = "00000000-0000-4000-8000-00000000c001"
const TRAIN_SUPPLIER_ID = "00000000-0000-4000-8000-00000000c002"

function buildAuthValue(supabase = buildSupabase()) {
  return {
    supabase,
    user: { id: "u1", email: "u@example.com" },
    profile: {
      clearanceLevel: "consultant",
      actorName: "Jane",
      name: "Jane",
      surname: "D",
      email: "u@example.com",
    },
  }
}

function buildSupabase() {
  const scheduleInsert = vi.fn(async () => ({ error: null }))

  return {
    scheduleInsert,
    from: vi.fn((table: string) => {
      if (table === "booking_supplier_schedules") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(async () => ({ data: [{ id: "schedule-1" }], error: null })),
              })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ error: null })),
            })),
          })),
          insert: scheduleInsert,
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
      if (table === "suppliers") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                { id: HOTEL_SUPPLIER_ID, kind: "hotel_property" },
                { id: TRAIN_SUPPLIER_ID, kind: "train_operator" },
              ],
              error: null,
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

const params = Promise.resolve({ id: BOOKING_ID })

describe("GET /api/jobs/[id]/supplier-schedules", () => {
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

  it("returns schedules when authenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: true,
      value: buildAuthValue(),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual([{ id: "schedule-1" }])
  })
})

describe("PUT /api/jobs/[id]/supplier-schedules", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireRole.mockReset()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ schedules: [] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it("rejects same-day hotel stays", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        schedules: [{
          supplierKind: "hotel_property",
          dateFrom: "2026-06-01",
          dateTo: "2026-06-01",
        }],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("rejects a supplier whose kind does not match the schedule kind", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        schedules: [{
          supplierId: TRAIN_SUPPLIER_ID,
          supplierKind: "hotel_property",
          dateFrom: "2026-06-01",
          dateTo: "2026-06-02",
        }],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: "Supplier does not match the selected schedule type",
    })
  })

  it("replaces supplier schedules with valid rows", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(supabase),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        schedules: [
          {
            supplierId: HOTEL_SUPPLIER_ID,
            supplierKind: "hotel_property",
            label: "Night 1",
            dateFrom: "2026-06-01",
            dateTo: "2026-06-02",
            timeStart: "14:00",
            timeEnd: "10:00",
          },
          {
            supplierId: TRAIN_SUPPLIER_ID,
            supplierKind: "train_operator",
            label: "Blue Train",
            dateFrom: "2026-06-02",
            dateTo: "2026-06-02",
            timeStart: "09:00",
            timeEnd: "18:00",
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.scheduleInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        supplier_id: HOTEL_SUPPLIER_ID,
        supplier_kind: "hotel_property",
        date_from: "2026-06-01",
        date_to: "2026-06-02",
      }),
      expect.objectContaining({
        supplier_id: TRAIN_SUPPLIER_ID,
        supplier_kind: "train_operator",
        date_from: "2026-06-02",
        date_to: "2026-06-02",
      }),
    ])
  })
})
