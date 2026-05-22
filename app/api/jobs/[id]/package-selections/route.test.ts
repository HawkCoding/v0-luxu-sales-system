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

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

interface MockState {
  packageId?: string | null
  validLegIds?: string[]
  bookingExists?: boolean
}

function buildSupabase(state: MockState = {}) {
  const updateCalls: Array<{ legId: string; payload: Record<string, unknown> }> = []

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
                  data: { id: BOOKING_ID, package_id: packageId },
                  error: null,
                }
              }),
            })),
          })),
        }
      }
      if (table === "package_legs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: (state.validLegIds ?? [LEG_A, LEG_B]).map((id) => ({ id })),
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
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return { supabase, updateCalls }
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

  it("applies updates per selection and audits", async () => {
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
})
