import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({})),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const REASON_ID = "00000000-0000-4000-8000-00000000bbbb"

function makeAuth(updateResult?: { data: unknown; error: unknown }) {
  const result = updateResult ?? {
    data: { id: REASON_ID, label: "Price too high", applies_to: "Lost", active: false },
    error: null,
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "outcome_reasons") {
            return {
              update: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => result),
                  })),
                })),
              })),
            }
          }
          throw new Error(`Unexpected table: ${table}`)
        }),
      },
      user: { id: USER_ID, email: "admin@example.com" },
      profile: {
        clearanceLevel: "admin",
        actorName: "Admin User",
        name: "Admin",
        surname: "User",
        email: "admin@example.com",
      },
    },
  })
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/settings/outcome-reasons/${REASON_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const ctx = { params: Promise.resolve({ id: REASON_ID }) }

describe("PATCH /api/settings/outcome-reasons/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401 for unauthenticated request", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(makeRequest({ active: false }), ctx)
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await PATCH(makeRequest({ active: false }), ctx)
    expect(res.status).toBe(403)
  })

  it("returns 400 when active is not a boolean", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ active: "no" }), ctx)
    expect(res.status).toBe(400)
  })

  it("returns 400 when active is missing", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({}), ctx)
    expect(res.status).toBe(400)
  })

  it("returns 404 when the update matches no row", async () => {
    makeAuth({ data: null, error: null })

    const res = await PATCH(makeRequest({ active: false }), ctx)
    expect(res.status).toBe(404)
    expect(auditMocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it("returns 200 and writes an audit log on success", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ active: false }), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: `outcome_reason:${REASON_ID}`,
        action: "settings_changed",
        after: expect.objectContaining({ active: false }),
      }),
    )
  })
})
