import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: authMocks.requireUser,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({ setting_key: "business_name" })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { GET, PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function makeAuth(overrides: { supabaseUpsertError?: { message: string } | null } = {}) {
  const upsertError = overrides.supabaseUpsertError ?? null
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [{ key: "business_name", value: "Existing Co" }],
              error: null,
            })),
          })),
          upsert: vi.fn(async () => ({ error: upsertError })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
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

  return { supabase }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/company", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/settings/company", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("includes app_logo_url alongside the other company fields", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: true,
      value: {
        supabase: {
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  { key: "business_name", value: "Existing Co" },
                  { key: "app_logo_url", value: "https://cdn.example.com/brand/app-logo.png" },
                ],
                error: null,
              })),
            })),
          })),
        },
      },
    })

    const body = await (await GET()).json()

    expect(body).toEqual({
      business_name: "Existing Co",
      app_logo_url: "https://cdn.example.com/brand/app-logo.png",
    })
  })
})

describe("PATCH /api/settings/company", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    authMocks.requireUser.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401 for unauthenticated request", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(makeRequest({ business_name: "Luxus Travel" }))
    expect(res.status).toBe(401)
  })

  it("returns 403 for insufficient role (consultant)", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await PATCH(makeRequest({ business_name: "Luxus Travel" }))
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid body (empty business_name)", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ business_name: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for missing business_name", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("returns 200 and persists the business name for admin", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ business_name: "Luxus Travel" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ business_name: "Luxus Travel" })
  })

  it("does not accept app_logo_url — that key is owned by /api/settings/app-logo", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ app_logo_url: "https://evil.example.com/logo.png" }))
    expect(res.status).toBe(400)
  })

  it("writes an audit log entry on success", async () => {
    makeAuth()

    await PATCH(makeRequest({ business_name: "Luxus Travel" }))

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "company",
        action: "settings_changed",
        before: { business_name: "Existing Co" },
        after: { business_name: "Luxus Travel" },
      }),
    )
  })
})
