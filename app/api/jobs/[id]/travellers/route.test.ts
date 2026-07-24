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

import { GET, PUT } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-00000000d001"
const TRAVELLER_ID = "00000000-0000-4000-8000-00000000d002"

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

function buildSupabase(opts: { bookingExists?: boolean } = {}) {
  const insertCalls: unknown[] = []
  const deleteCalls: string[] = []

  const travellerRow = {
    id: TRAVELLER_ID,
    booking_id: BOOKING_ID,
    prefix: "Mr",
    first_name: "John",
    last_name: "Smith",
    id_passport: "A1234567",
    date_of_birth: "1980-01-01",
    residence: "South Africa",
    is_child: false,
    sort_order: 0,
  }

  return {
    insertCalls,
    deleteCalls,
    from: vi.fn((table: string) => {
      if (table === "travellers") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [travellerRow], error: null })),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_col: string, value: string) => {
              deleteCalls.push(value)
              return { error: null }
            }),
          })),
          insert: vi.fn(async (rows: unknown) => {
            insertCalls.push(rows)
            return { error: null }
          }),
        }
      }
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: opts.bookingExists === false ? null : { id: BOOKING_ID },
                error: null,
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

const params = Promise.resolve({ id: BOOKING_ID })

describe("GET /api/jobs/[id]/travellers", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(403)
  })

  it("returns travellers when authorised", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.travellers).toEqual([
      {
        id: TRAVELLER_ID,
        prefix: "Mr",
        firstName: "John",
        lastName: "Smith",
        idPassport: "A1234567",
        dateOfBirth: "1980-01-01",
        residence: "South Africa",
        roomWith: "",
        roomType: "",
        isChild: false,
        sortOrder: 0,
      },
    ])
  })
})

describe("PUT /api/jobs/[id]/travellers", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid JSON", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", { method: "PUT", body: "not json" })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 400 when a guest is missing a name", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [{ firstName: "", lastName: "Smith", idPassport: "A1234567", isChild: false }] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 400 when a guest is missing an ID/passport number", async () => {
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue() })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [{ firstName: "John", lastName: "Smith", idPassport: "", isChild: false }] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(400)
  })

  it("returns 404 when the booking does not exist", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: buildAuthValue(buildSupabase({ bookingExists: false })),
    })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ travellers: [] }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(404)
  })

  it("replaces travellers and writes an audit log", async () => {
    const supabase = buildSupabase()
    authMocks.requireRole.mockResolvedValue({ ok: true, value: buildAuthValue(supabase) })
    const req = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        travellers: [
          {
            prefix: "Mrs",
            firstName: "Jane",
            lastName: "Doe",
            idPassport: "B7654321",
            dateOfBirth: "1990-05-05",
            residence: "United Kingdom",
            isChild: false,
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
    expect(supabase.deleteCalls).toEqual([BOOKING_ID])
    expect(supabase.insertCalls).toEqual([
      [
        expect.objectContaining({
          booking_id: BOOKING_ID,
          prefix: "Mrs",
          first_name: "Jane",
          last_name: "Doe",
          id_passport: "B7654321",
          date_of_birth: "1990-05-05",
          residence: "United Kingdom",
          is_child: false,
          sort_order: 0,
        }),
      ],
    ])
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ action: "travellers_updated", entityId: BOOKING_ID }),
    )
  })
})
