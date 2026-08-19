import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const settingsAccessMocks = vi.hoisted(() => ({
  requireSettingsWrite: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
}))

vi.mock("@/lib/settings-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/settings-access")>("@/lib/settings-access")
  return {
    ...actual,
    requireSettingsWrite: settingsAccessMocks.requireSettingsWrite,
  }
})

vi.mock("@/lib/api/auth", () => ({
  requireAnyRole: authMocks.requireAnyRole,
}))

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
              data: [{ key: "quote_doc_title", value: "OLD TITLE" }],
              error: null,
            })),
          })),
          upsert: vi.fn(async () => ({ error: upsertError })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      userId: USER_ID,
      actorName: "Manager User",
      role: "manager",
    },
  })

  authMocks.requireAnyRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID },
      profile: { clearanceLevel: "manager", actorName: "Manager User" },
    },
  })

  return { supabase }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/document-text", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("GET /api/settings/document-text", () => {
  beforeEach(() => {
    authMocks.requireAnyRole.mockReset()
  })

  it("returns 401/403 passthrough when access is denied", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
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
    expect(body.quote_doc_title).toBe("OLD TITLE")
    expect(body.quote_doc_footer_text).toBeTruthy()
    // New PDF wording keys fall back to their defaults.
    expect(body.voucher_doc_title).toBe("TRAVEL VOUCHERS")
    expect(body.invoice_doc_deposit_title).toBe("DEPOSIT INVOICE")
    expect(body.invoice_doc_final_title).toBe("FINAL INVOICE")
    expect(body.invoice_doc_footer_text).toBeTruthy()
    expect(body.itinerary_doc_journey_heading).toBe("Your Journey")
    expect(body.itinerary_doc_intro_text).toBe("")
    // Email wording now lives in the templates table, not settings.
    expect(body.quote_email_accept_text).toBeUndefined()
    expect(body.invoice_email_closing).toBeUndefined()
  })
})

describe("PATCH /api/settings/document-text", () => {
  beforeEach(() => {
    settingsAccessMocks.requireSettingsWrite.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401 for unauthenticated request", async () => {
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await PATCH(makeRequest({ quote_doc_title: "NEW TITLE" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for empty body", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("returns 400 for blank field value", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ quote_doc_title: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for blank voucher title", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ voucher_doc_title: "" }))
    expect(res.status).toBe(400)
  })

  it("accepts an empty itinerary intro (clears the paragraph)", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ itinerary_doc_intro_text: "" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ itinerary_doc_intro_text: "" })
  })

  it("persists new PDF wording keys", async () => {
    makeAuth()

    const res = await PATCH(
      makeRequest({ voucher_doc_title: "SERVICE VOUCHERS", invoice_doc_footer_text: "Custom footer" }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      voucher_doc_title: "SERVICE VOUCHERS",
      invoice_doc_footer_text: "Custom footer",
    })
  })

  it("returns 200 and persists the field", async () => {
    makeAuth()

    const res = await PATCH(makeRequest({ quote_doc_title: "NEW TITLE" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ quote_doc_title: "NEW TITLE" })
  })

  it("writes an audit log entry on success", async () => {
    makeAuth()

    await PATCH(makeRequest({ quote_doc_title: "NEW TITLE" }))

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "document-text",
        action: "settings_changed",
        before: { quote_doc_title: "OLD TITLE" },
        after: { quote_doc_title: "NEW TITLE" },
      }),
    )
  })
})
