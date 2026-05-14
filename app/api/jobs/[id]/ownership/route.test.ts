import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

function postJson(body: unknown) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}/ownership`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

interface SupabaseOptions {
  role?: string
  assignedSalespersonId?: string | null
  targetProfile?: { user_id: string; clearance_level: string; is_active: boolean } | null
}

function mockAuth({
  role = "consultant",
  assignedSalespersonId = null,
  targetProfile = { user_id: OTHER_USER_ID, clearance_level: "consultant", is_active: true },
}: SupabaseOptions = {}) {
  const updatePayload = vi.fn()
  const auditInsert = vi.fn(async () => ({ error: null }))
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: BOOKING_ID, assigned_salesperson_id: assignedSalespersonId },
                error: null,
              })),
            })),
          })),
          update: vi.fn((payload: unknown) => {
            updatePayload(payload)
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({
                    data: {
                      id: BOOKING_ID,
                      assigned_salesperson_id: (payload as { assigned_salesperson_id: string | null }).assigned_salesperson_id,
                      updated_at: "2026-05-13T10:00:00.000Z",
                    },
                    error: null,
                  })),
                })),
              })),
            }
          }),
        }
      }
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: targetProfile, error: null })),
            })),
          })),
        }
      }
      if (table === "audit_logs") {
        return { insert: auditInsert }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "jane@example.com" },
      profile: {
        clearanceLevel: role,
        actorName: "Jane Doe",
        name: "Jane",
        surname: "Doe",
        email: "jane@example.com",
        isActive: true,
      },
    },
  })

  return { updatePayload, auditInsert }
}

describe("POST /api/jobs/[id]/ownership", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(postJson({ action: "claim" }), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    mockAuth({ role: "readonly" })

    const res = await POST(postJson({ action: "claim" }), makeParams())
    expect(res.status).toBe(403)
  })

  it("allows a consultant to claim an unassigned booking", async () => {
    const { updatePayload, auditInsert } = mockAuth()

    const res = await POST(postJson({ action: "claim" }), makeParams())
    expect(res.status).toBe(200)
    expect(updatePayload).toHaveBeenCalledWith(expect.objectContaining({ assigned_salesperson_id: USER_ID }))
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "salesperson_reassigned" }))
  })

  it("returns 409 when claiming an already assigned booking", async () => {
    mockAuth({ assignedSalespersonId: OTHER_USER_ID })

    const res = await POST(postJson({ action: "claim" }), makeParams())
    expect(res.status).toBe(409)
  })

  it("allows the assigned owner to release", async () => {
    const { updatePayload } = mockAuth({ assignedSalespersonId: USER_ID })

    const res = await POST(postJson({ action: "release" }), makeParams())
    expect(res.status).toBe(200)
    expect(updatePayload).toHaveBeenCalledWith(expect.objectContaining({ assigned_salesperson_id: null }))
  })

  it("allows a manager to release another salesperson's booking", async () => {
    const { updatePayload } = mockAuth({ role: "manager", assignedSalespersonId: OTHER_USER_ID })

    const res = await POST(postJson({ action: "release" }), makeParams())
    expect(res.status).toBe(200)
    expect(updatePayload).toHaveBeenCalledWith(expect.objectContaining({ assigned_salesperson_id: null }))
  })

  it("returns 403 when a consultant releases someone else's booking", async () => {
    mockAuth({ assignedSalespersonId: OTHER_USER_ID })

    const res = await POST(postJson({ action: "release" }), makeParams())
    expect(res.status).toBe(403)
  })

  it("allows a manager to assign a valid target", async () => {
    const { updatePayload } = mockAuth({ role: "manager" })

    const res = await POST(postJson({ action: "assign", userId: OTHER_USER_ID }), makeParams())
    expect(res.status).toBe(200)
    expect(updatePayload).toHaveBeenCalledWith(expect.objectContaining({ assigned_salesperson_id: OTHER_USER_ID }))
  })

  it("returns 403 when a consultant assigns", async () => {
    mockAuth()

    const res = await POST(postJson({ action: "assign", userId: OTHER_USER_ID }), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 400 when assign is missing userId", async () => {
    mockAuth({ role: "manager" })

    const res = await POST(postJson({ action: "assign" }), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 404 when assign target is inactive or missing", async () => {
    mockAuth({ role: "manager", targetProfile: null })

    const res = await POST(postJson({ action: "assign", userId: OTHER_USER_ID }), makeParams())
    expect(res.status).toBe(404)
  })
})
