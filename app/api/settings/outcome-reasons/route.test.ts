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

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const REASON_ID = "00000000-0000-4000-8000-00000000bbbb"

function makeAuth(insertResult?: { data: unknown; error: unknown }) {
  const result = insertResult ?? {
    data: {
      id: REASON_ID,
      label: "Price too high",
      applies_to: "Lost",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  }

  const auditInsert = vi.fn(async () => ({ error: null }))

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "outcome_reasons") {
            return {
              insert: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(async () => result),
                })),
              })),
            }
          }
          if (table === "audit_logs") return { insert: auditInsert }
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

  return { auditInsert }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/outcome-reasons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/settings/outcome-reasons", () => {
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

    const res = await POST(makeRequest({ label: "Price too high", appliesTo: "Lost" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(makeRequest({ label: "Price too high", appliesTo: "Lost" }))
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid body (missing label)", async () => {
    makeAuth()

    const res = await POST(makeRequest({ appliesTo: "Lost" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid appliesTo value", async () => {
    makeAuth()

    const res = await POST(makeRequest({ label: "Price too high", appliesTo: "Invalid" }))
    expect(res.status).toBe(400)
  })

  it("returns 201 and creates the reason for admin", async () => {
    makeAuth()

    const res = await POST(makeRequest({ label: "Price too high", appliesTo: "Lost" }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      id: REASON_ID,
      label: "Price too high",
      appliesTo: "Lost",
    })
  })

  it("writes an audit log entry on success", async () => {
    makeAuth()

    await POST(makeRequest({ label: "Price too high", appliesTo: "Lost" }))

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        action: "settings_changed",
        after: expect.objectContaining({ label: "Price too high", appliesTo: "Lost" }),
      }),
    )
  })
})
