import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const settingsAccessMocks = vi.hoisted(() => ({
  requireAdminSettingsAccess: vi.fn(),
}))

vi.mock("@/lib/settings-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings-access")>("@/lib/settings-access")
  return {
    ...actual,
    requireAdminSettingsAccess: settingsAccessMocks.requireAdminSettingsAccess,
  }
})

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn((key: string) => ({ setting_key: key })),
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
              data: [{ key: "brand_block_heading", value: "OLD HEADING" }],
              error: null,
            })),
          })),
          upsert: vi.fn(async () => ({ error: upsertError })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  settingsAccessMocks.requireAdminSettingsAccess.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      userId: USER_ID,
      actorName: "Admin User",
      role: "admin",
    },
  })

  return { supabase }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/document-brand", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/settings/document-brand", () => {
  beforeEach(() => {
    settingsAccessMocks.requireAdminSettingsAccess.mockReset()
  })

  it("returns the auth failure response when access is denied", async () => {
    settingsAccessMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns settings with defaults filled in", async () => {
    makeAuth()

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.brand_block_heading).toBe("OLD HEADING")
    expect(body.brand_block_subheading).toBeTruthy()
    expect(body.brand_block_logo_url).toBe("")
    expect(body.brand_block_position_quote).toBe("top")
    expect(body.brand_block_position_invoice).toBe("top")
    expect(body.brand_block_position_email).toBe("top")
  })
})

describe("PATCH /api/settings/document-brand", () => {
  beforeEach(() => {
    settingsAccessMocks.requireAdminSettingsAccess.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401/403 passthrough when access is denied", async () => {
    settingsAccessMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(makeRequest({ brand_block_heading: "New heading" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for empty body", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("returns 400 for a blank heading", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ brand_block_heading: "" }))
    expect(res.status).toBe(400)
  })

  it("rejects an invalid position value", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ brand_block_position_quote: "sideways" }))
    expect(res.status).toBe(400)
  })

  it("accepts a valid position value", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ brand_block_position_quote: "hidden" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ brand_block_position_quote: "hidden" })
  })

  it("accepts the email position value", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ brand_block_position_email: "top" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ brand_block_position_email: "top" })
  })

  it("persists the heading and writes an audit log entry", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ brand_block_heading: "New heading" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ brand_block_heading: "New heading" })
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "document-brand",
        action: "settings_changed",
        before: { brand_block_heading: "OLD HEADING" },
        after: { brand_block_heading: "New heading" },
      }),
    )
  })
})
