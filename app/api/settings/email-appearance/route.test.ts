import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const settingsAccessMocks = vi.hoisted(() => ({
  requireManagerSettingsAccess: vi.fn(),
}))

vi.mock("@/lib/settings-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings-access")>("@/lib/settings-access")
  return {
    ...actual,
    requireManagerSettingsAccess: settingsAccessMocks.requireManagerSettingsAccess,
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

function makeAuth(
  rows: { key: string; value: string }[] = [{ key: "email_font_family", value: "Georgia, serif" }],
) {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: rows, error: null })),
          })),
          upsert: vi.fn(async () => ({ error: null })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  settingsAccessMocks.requireManagerSettingsAccess.mockResolvedValue({
    ok: true,
    value: { supabase, userId: USER_ID, actorName: "Manager User", role: "manager" },
  })

  return { supabase }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/email-appearance", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/settings/email-appearance", () => {
  beforeEach(() => {
    settingsAccessMocks.requireManagerSettingsAccess.mockReset()
  })

  it("returns 403 passthrough when access is denied", async () => {
    settingsAccessMocks.requireManagerSettingsAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns stored values with defaults filled in", async () => {
    makeAuth()

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.email_font_family).toBe("Georgia, serif")
    expect(body.email_font_size).toBe("16px")
  })

  it("coerces an unrecognised stored value back to the default", async () => {
    makeAuth([{ key: "email_font_family", value: "Comic Sans; } body { display:none" }])

    const res = await GET()
    const body = await res.json()

    expect(body.email_font_family).toBe("Arial, sans-serif")
  })
})

describe("PATCH /api/settings/email-appearance", () => {
  beforeEach(() => {
    settingsAccessMocks.requireManagerSettingsAccess.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401 for unauthenticated request", async () => {
    settingsAccessMocks.requireManagerSettingsAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(makeRequest({ email_font_family: "Georgia, serif" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for empty body", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("rejects a font family outside the allowlist", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ email_font_family: "Wingdings, fantasy" }))
    expect(res.status).toBe(400)
  })

  it("rejects a CSS injection attempt in the font family", async () => {
    makeAuth()

    const res = await PATCH(
      makeRequest({ email_font_family: "Arial; } body { background: url(http://evil) " }),
    )
    expect(res.status).toBe(400)
  })

  it("rejects a font size outside the allowlist", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ email_font_size: "72px" }))
    expect(res.status).toBe(400)
  })

  it("returns 200 and persists both fields", async () => {
    makeAuth()

    const res = await PATCH(
      makeRequest({ email_font_family: "Georgia, serif", email_font_size: "18px" }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ email_font_family: "Georgia, serif", email_font_size: "18px" })
  })

  it("writes an audit log entry on success", async () => {
    makeAuth()

    await PATCH(makeRequest({ email_font_family: "Verdana, Geneva, sans-serif" }))

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "email-appearance",
        action: "settings_changed",
        before: { email_font_family: "Georgia, serif" },
        after: { email_font_family: "Verdana, Geneva, sans-serif" },
      }),
    )
  })
})
