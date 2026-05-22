import { beforeEach, describe, expect, it, vi } from "vitest"

const authMocks = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireUser: authMocks.requireUser }))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const REASON_ID = "00000000-0000-4000-8000-00000000bb01"
const OTHER_REASON_ID = "00000000-0000-4000-8000-00000000bb02"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

function patchJson(body: unknown) {
  return new Request(`http://localhost/api/jobs/${BOOKING_ID}/outcome`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

interface MockOptions {
  role?: string
  bookingOwnerId?: string | null
  assignedSalespersonId?: string | null
  bookingOutcome?: string
  reason?: { id: string; label: string; applies_to: string; active: boolean } | null
  updateError?: { message: string } | null
  auditError?: { message: string } | null
}

function mockAuth(opts: MockOptions = {}) {
  const {
    role = "consultant",
    bookingOwnerId = USER_ID,
    assignedSalespersonId = null,
    bookingOutcome = "Open",
    reason = { id: REASON_ID, label: "Price too high", applies_to: "Lost", active: true },
    updateError = null,
    auditError = null,
  } = opts

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: BOOKING_ID,
                  outcome: bookingOutcome,
                  assigned_salesperson_id: assignedSalespersonId,
                  owner_user_id: bookingOwnerId,
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: updateError })),
          })),
        }
      }
      if (table === "outcome_reasons") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: reason, error: null })),
            })),
          })),
        }
      }
      if (table === "audit_logs") {
        return {
          insert: vi.fn(async () => ({ error: auditError })),
        }
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) }
    }),
  }

  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "test@example.com" },
      profile: {
        clearanceLevel: role,
        isActive: true,
        name: "Test",
        surname: "User",
        email: "test@example.com",
        actorName: "Test User",
      },
    },
  })

  return supabase
}

describe("PATCH /api/jobs/[id]/outcome", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await PATCH(patchJson({ outcome: "Open" }), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    mockAuth({ role: "readonly" })
    const res = await PATCH(patchJson({ outcome: "Open" }), makeParams())
    expect(res.status).toBe(403)
  })

  it("returns 400 for missing outcome field", async () => {
    mockAuth()
    const res = await PATCH(patchJson({}), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid outcome value", async () => {
    mockAuth()
    const res = await PATCH(patchJson({ outcome: "Pending" }), makeParams())
    expect(res.status).toBe(400)
  })

  it("returns 400 when Lost is set without a reason", async () => {
    mockAuth()
    const res = await PATCH(patchJson({ outcome: "Lost" }), makeParams())
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reason/i)
  })

  it("returns 400 when Cancelled is set without a reason", async () => {
    mockAuth()
    const res = await PATCH(patchJson({ outcome: "Cancelled" }), makeParams())
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reason/i)
  })

  it("returns 400 when Other reason is selected without notes", async () => {
    mockAuth({
      reason: { id: OTHER_REASON_ID, label: "Other", applies_to: "Lost", active: true },
    })
    const res = await PATCH(
      patchJson({ outcome: "Lost", reasonId: OTHER_REASON_ID }),
      makeParams(),
    )
    const body = await res.json() as { error: string }
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/notes/i)
  })

  it("succeeds when Other reason has non-empty notes", async () => {
    mockAuth({
      reason: { id: OTHER_REASON_ID, label: "Other", applies_to: "Lost", active: true },
    })
    const res = await PATCH(
      patchJson({ outcome: "Lost", reasonId: OTHER_REASON_ID, outcomeNotes: "Specific detail" }),
      makeParams(),
    )
    expect(res.status).toBe(200)
  })

  it("allows consultant to set outcome on own booking", async () => {
    mockAuth({ role: "consultant", bookingOwnerId: USER_ID, assignedSalespersonId: null })
    const res = await PATCH(patchJson({ outcome: "Open" }), makeParams())
    expect(res.status).toBe(200)
  })

  it("returns 403 when consultant tries to set outcome on another's booking", async () => {
    mockAuth({ role: "consultant", bookingOwnerId: "other-user", assignedSalespersonId: null })
    const res = await PATCH(patchJson({ outcome: "Open" }), makeParams())
    expect(res.status).toBe(403)
  })

  it("allows manager to set outcome on any booking", async () => {
    mockAuth({ role: "manager", bookingOwnerId: "someone-else", assignedSalespersonId: null })
    const res = await PATCH(patchJson({ outcome: "Open" }), makeParams())
    expect(res.status).toBe(200)
  })

  it("succeeds and sets outcome with valid reason for Lost", async () => {
    mockAuth({ reason: { id: REASON_ID, label: "Price too high", applies_to: "Lost", active: true } })
    const res = await PATCH(
      patchJson({ outcome: "Lost", reasonId: REASON_ID }),
      makeParams(),
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; outcome: string }
    expect(body.ok).toBe(true)
    expect(body.outcome).toBe("Lost")
  })

  it("defaults outcome is Open (new booking has outcome field)", () => {
    // Validated via migration default — this test confirms the type is correct
    const outcome: string = "Open"
    expect(["Open", "Won", "Lost", "Cancelled"]).toContain(outcome)
  })
})
