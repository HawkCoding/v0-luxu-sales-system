import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const settingsAccessMocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  requireSettingsWrite: vi.fn(),
  getEmailSignatureSettings: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireAnyRole: settingsAccessMocks.requireAnyRole,
}))

vi.mock("@/lib/settings-access", () => ({
  requireSettingsWrite: settingsAccessMocks.requireSettingsWrite,
  getEmailSignatureSettings: settingsAccessMocks.getEmailSignatureSettings,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({ setting_key: "email-signature" })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { PATCH } from "./route"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/email-signature", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeSupabase() {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({ data: [], error: null })),
      upsert: vi.fn(async () => ({ error: null })),
    })),
  }
}

describe("PATCH /api/settings/email-signature", () => {
  beforeEach(() => {
    settingsAccessMocks.requireSettingsWrite.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("401s when unauthenticated", async () => {
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(makeRequest({ signature_company_line: "x" }))
    expect(res.status).toBe(401)
  })

  it("sanitizes a rich-text field before storing it, stripping a script tag", async () => {
    const supabase = makeSupabase()
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
      ok: true,
      value: { supabase, actorName: "Admin", userId: "admin-1" },
    })

    const res = await PATCH(
      makeRequest({ signature_company_line: "<p>hi</p><script>bad()</script>" }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.signature_company_line).toBe("<p>hi</p>")
  })

  it("leaves signature_enabled untouched by sanitizing (plain 'true'/'false' flag)", async () => {
    const supabase = makeSupabase()
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
      ok: true,
      value: { supabase, actorName: "Admin", userId: "admin-1" },
    })

    const res = await PATCH(makeRequest({ signature_enabled: "false" }))
    const body = await res.json()

    expect(body.signature_enabled).toBe("false")
  })

  it("accepts and sanitizes signature_sender_layout", async () => {
    const supabase = makeSupabase()
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
      ok: true,
      value: { supabase, actorName: "Admin", userId: "admin-1" },
    })

    const layout = '<p><strong>{{fullName}}</strong></p><script>bad()</script>'
    const res = await PATCH(makeRequest({ signature_sender_layout: layout }))
    const body = await res.json()

    expect(body.signature_sender_layout).toBe("<p><strong>{{fullName}}</strong></p>")
  })

  it("400s an empty body", async () => {
    const supabase = makeSupabase()
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
      ok: true,
      value: { supabase, actorName: "Admin", userId: "admin-1" },
    })

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })
})
