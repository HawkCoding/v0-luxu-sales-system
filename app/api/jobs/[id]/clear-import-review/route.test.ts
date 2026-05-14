import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

function makeParams(id = BOOKING_ID) {
  return { params: Promise.resolve({ id }) }
}

function mockAuth(emailImportNeedsReview = true) {
  const auditInsert = vi.fn(async () => ({ error: null }))
  const updatePayload = vi.fn()
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: BOOKING_ID, email_import_needs_review: emailImportNeedsReview },
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
                      email_import_needs_review: false,
                      email_import_review_resolved_at: "2026-05-13T10:00:00.000Z",
                    },
                    error: null,
                  })),
                })),
              })),
            }
          }),
        }
      }
      if (table === "audit_logs") return { insert: auditInsert }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID, email: "manager@example.com" },
      profile: { clearanceLevel: "manager", actorName: "Manager", name: "Manager", surname: null, email: "manager@example.com" },
    },
  })

  return { auditInsert, updatePayload }
}

describe("POST /api/jobs/[id]/clear-import-review", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(401)
  })

  it("returns 403 for consultant role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(403)
  })

  it("clears pending review for managers and creates audit entry", async () => {
    const { auditInsert, updatePayload } = mockAuth()

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(200)
    expect(updatePayload).toHaveBeenCalledWith(expect.objectContaining({ email_import_needs_review: false }))
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ action: "email_import_review_resolved" }))
  })

  it("returns 400 when review is not pending", async () => {
    mockAuth(false)

    const res = await POST(new Request("http://localhost"), makeParams())
    expect(res.status).toBe(400)
  })
})
