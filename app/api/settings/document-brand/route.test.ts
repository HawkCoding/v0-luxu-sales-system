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

function makeAuth(
  overrides: {
    supabaseUpsertError?: { message: string } | null
    kindOverrideRows?: { key: string; value: string }[]
  } = {},
) {
  const upsertError = overrides.supabaseUpsertError ?? null
  const appSettingsUpsert = vi.fn(async () => ({ error: upsertError }))
  const kindUpsert = vi.fn(async () => ({ error: null }))
  const kindDelete = vi.fn(() => ({
    eq: vi.fn(() => ({
      in: vi.fn(async () => ({ error: null })),
    })),
  }))
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
          upsert: appSettingsUpsert,
        }
      }
      if (table === "supplier_kind_document_text") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(async () => ({ data: overrides.kindOverrideRows ?? [], error: null })),
            })),
          })),
          upsert: kindUpsert,
          delete: kindDelete,
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
      actorName: "Admin User",
      role: "admin",
    },
  })

  authMocks.requireAnyRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: USER_ID },
      profile: { clearanceLevel: "admin", actorName: "Admin User" },
    },
  })

  return { supabase, appSettingsUpsert, kindUpsert, kindDelete }
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
    authMocks.requireAnyRole.mockReset()
  })

  it("returns the auth failure response when access is denied", async () => {
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
    expect(body.brand_block_heading).toBe("OLD HEADING")
    expect(body.brand_block_subheading).toBeTruthy()
    expect(body.brand_block_logo_url).toBe("")
    expect(body.brand_block_position_quote).toBe("top")
    expect(body.brand_block_position_invoice).toBe("top")
    expect(body.brand_block_position_email).toBe("top")
  })

  it("overlays a per-kind subheading override when ?kind= is a known supplier kind", async () => {
    makeAuth({ kindOverrideRows: [{ key: "brand_block_subheading", value: "Luxury Stays" }] })

    const res = await GET(
      new Request("http://localhost/api/settings/document-brand?kind=hotel_property"),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.brand_block_subheading).toBe("Luxury Stays")
    // Positions and the logo are chrome, not per-product wording -- never overridden.
    expect(body.brand_block_position_quote).toBe("top")
  })
})

describe("PATCH /api/settings/document-brand", () => {
  beforeEach(() => {
    settingsAccessMocks.requireSettingsWrite.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401/403 passthrough when access is denied", async () => {
    settingsAccessMocks.requireSettingsWrite.mockResolvedValue({
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

  describe("per-kind override (kind field present in the body)", () => {
    it("writes the per-kind table, not app_settings", async () => {
      const { appSettingsUpsert, kindUpsert } = makeAuth()

      const res = await PATCH(
        makeRequest({ kind: "hotel_property", brand_block_subheading: "Luxury Stays" }),
      )
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(kindUpsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            kind: "hotel_property",
            key: "brand_block_subheading",
            value: "Luxury Stays",
          }),
        ],
        { onConflict: "kind,key" },
      )
      expect(appSettingsUpsert).not.toHaveBeenCalled()
      expect(body.brand_block_heading).toBe("OLD HEADING")
    })

    it("treats an empty value as deleting the override", async () => {
      const { kindDelete } = makeAuth()

      const res = await PATCH(makeRequest({ kind: "hotel_property", brand_block_subheading: "" }))

      expect(res.status).toBe(200)
      expect(kindDelete).toHaveBeenCalled()
    })

    it("rejects a position field on a kind-scoped patch", async () => {
      makeAuth()

      const res = await PATCH(
        makeRequest({ kind: "hotel_property", brand_block_position_quote: "hidden" }),
      )
      expect(res.status).toBe(400)
    })

    it("returns 400 for an unrecognized kind", async () => {
      makeAuth()

      const res = await PATCH(
        makeRequest({ kind: "not-a-real-kind", brand_block_subheading: "Luxury Stays" }),
      )
      expect(res.status).toBe(400)
    })

    it("writes the audit log entity id scoped to the kind", async () => {
      makeAuth()

      await PATCH(makeRequest({ kind: "hotel_property", brand_block_subheading: "Luxury Stays" }))

      expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ entityId: "document-brand:hotel_property" }),
      )
    })
  })
})
