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

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
}))

import { GET, PATCH } from "./route"

const BOOKING_ID = "00000000-0000-4000-8000-000000000001"
const LEG_A = "00000000-0000-4000-8000-0000000000a1"
const TRANSPORT_ID = "00000000-0000-4000-8000-0000000000b1"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  selectionRows?: unknown[]
  transportRows?: unknown[]
}

function buildSupabase(state: MockState = {}) {
  const selectionUpdateCalls: Array<{ legId: string; payload: Record<string, unknown> }> = []
  const transportUpdateCalls: Array<{ requestId: string; payload: Record<string, unknown> }> = []

  const selectionRows =
    state.selectionRows ??
    [
      {
        id: "sel-1",
        package_leg_id: LEG_A,
        selected: true,
        supplier_reference: null,
        package_legs: { label: "Rovos Rail", sort_order: 0 },
        suppliers: { name: "Rovos Rail", kind: "train_operator" },
      },
    ]

  const transportRows =
    state.transportRows ??
    [
      {
        id: TRANSPORT_ID,
        package_leg_id: null,
        service_type: "transfer",
        pickup_point: "Airport",
        dropoff_point: "Hotel",
        sort_order: 0,
        supplier_reference: "REF-123",
        suppliers: { name: "ABC Transfers" },
      },
    ]

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "booking_package_selections") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: selectionRows, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async (_col: string, legId: string) => {
                selectionUpdateCalls.push({ legId, payload })
                return { error: null }
              }),
            })),
          })),
        }
      }
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: transportRows, error: null })),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async (_col: string, requestId: string) => {
                transportUpdateCalls.push({ requestId, payload })
                return { error: null }
              }),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, selectionUpdateCalls, transportUpdateCalls }
}

function mockAuthUser(state: MockState = {}) {
  const built = buildSupabase(state)
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: { supabase: built.supabase, user: { id: "u1", email: "u@example.com" } },
  })
  return built
}

function mockAuthRole(state: MockState = {}) {
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

describe("GET /api/jobs/[id]/leg-references", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns selected package legs and transport requests as reference rows", async () => {
    mockAuthUser()
    const res = await GET(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toEqual([
      {
        key: `selection:sel-1`,
        kind: "selection",
        id: LEG_A,
        label: "Rovos Rail",
        supplierName: "Rovos Rail",
        supplierReference: null,
      },
      {
        key: `transport_request:${TRANSPORT_ID}`,
        kind: "transport_request",
        id: TRANSPORT_ID,
        label: "Transfer: Airport → Hotel",
        supplierName: "ABC Transfers",
        supplierReference: "REF-123",
      },
    ])
  })

  it("excludes selected legs whose supplier kind is transfers/vehicle_rental", async () => {
    mockAuthUser({
      selectionRows: [
        {
          id: "sel-2",
          package_leg_id: LEG_A,
          selected: true,
          supplier_reference: null,
          package_legs: { label: "Transfer leg", sort_order: 0 },
          suppliers: { name: "ABC Transfers", kind: "transfers" },
        },
      ],
      transportRows: [],
    })
    const res = await GET(new Request("http://localhost"), makeParams())
    const body = await res.json()
    expect(body.rows).toEqual([])
  })
})

describe("PATCH /api/jobs/[id]/leg-references", () => {
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
        body: JSON.stringify({ updates: [{ kind: "selection", id: LEG_A, supplierReference: "REF" }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 for an empty updates array", async () => {
    mockAuthRole()
    const res = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ updates: [] }) }),
      makeParams(),
    )
    expect(res.status).toBe(400)
  })

  it("updates supplier_reference on booking_package_selections for a selection row and audits", async () => {
    const { selectionUpdateCalls } = mockAuthRole()
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ updates: [{ kind: "selection", id: LEG_A, supplierReference: "REF-456" }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(selectionUpdateCalls).toEqual([{ legId: LEG_A, payload: { supplier_reference: "REF-456" } }])
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "leg_supplier_reference_updated" }),
    )
  })

  it("updates supplier_reference on booking_transport_requests for a transport_request row", async () => {
    const { transportUpdateCalls } = mockAuthRole()
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          updates: [{ kind: "transport_request", id: TRANSPORT_ID, supplierReference: "REF-789" }],
        }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(transportUpdateCalls).toEqual([{ requestId: TRANSPORT_ID, payload: { supplier_reference: "REF-789" } }])
  })

  it("normalizes a blank reference to null", async () => {
    const { selectionUpdateCalls } = mockAuthRole()
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ updates: [{ kind: "selection", id: LEG_A, supplierReference: "   " }] }),
      }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    expect(selectionUpdateCalls).toEqual([{ legId: LEG_A, payload: { supplier_reference: null } }])
  })
})
