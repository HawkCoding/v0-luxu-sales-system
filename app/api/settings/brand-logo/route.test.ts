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

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function makeFile(name: string, type: string, sizeBytes = 10): File {
  return new File([new Uint8Array(sizeBytes)], name, { type })
}

function createRequest(file: File | null): Request {
  return {
    formData: async () => ({
      get: (key: string) => (key === "file" ? file : null),
    }),
  } as Request
}

function makeAuth({
  uploadError = null,
  settingUpsertError = null,
  previousValue = null,
}: {
  uploadError?: { message: string } | null
  settingUpsertError?: { message: string } | null
  previousValue?: string | null
} = {}) {
  const uploads: Array<{ path: string; contentType: string; upsert: boolean }> = []
  const upserts: Array<Record<string, unknown>> = []

  const supabase = {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string, _buf: Uint8Array, options: { contentType: string; upsert: boolean }) => {
          uploads.push({ path, ...options })
          return { error: uploadError }
        }),
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://example.test/storage/v1/object/public/voucher-assets/${path}` },
        })),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "app_settings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: previousValue ? { value: previousValue } : null, error: null }),
            }),
          }),
          upsert: vi.fn(async (payload: Record<string, unknown>) => {
            upserts.push(payload)
            return { error: settingUpsertError }
          }),
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

  return { supabase, uploads, upserts }
}

describe("POST /api/settings/brand-logo", () => {
  beforeEach(() => {
    settingsAccessMocks.requireAdminSettingsAccess.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401/403 passthrough when access is denied", async () => {
    settingsAccessMocks.requireAdminSettingsAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(createRequest(makeFile("logo.png", "image/png")))
    expect(res.status).toBe(403)
  })

  it("returns 400 when no file is provided", async () => {
    makeAuth()

    const res = await POST(createRequest(null))
    expect(res.status).toBe(400)
  })

  it("returns 400 for a non-PNG file", async () => {
    makeAuth()

    const res = await POST(createRequest(makeFile("logo.jpg", "image/jpeg")))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Logo uploads must be cropped to PNG.")
  })

  it("returns 413 for an oversized file", async () => {
    makeAuth()

    const res = await POST(createRequest(makeFile("logo.png", "image/png", 6 * 1024 * 1024)))
    expect(res.status).toBe(413)
  })

  it("uploads the logo and persists the setting", async () => {
    const { uploads, upserts } = makeAuth()

    const res = await POST(createRequest(makeFile("logo.png", "image/png")))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toContain("/voucher-assets/brand/sarail-footer-logo.png?t=")
    expect(uploads).toEqual([
      { path: "brand/sarail-footer-logo.png", contentType: "image/png", upsert: true },
    ])
    expect(upserts[0]).toMatchObject({ key: "brand_block_logo_url" })
  })

  it("writes an audit log entry recording the previous value", async () => {
    makeAuth({ previousValue: "https://old-url/logo.png" })

    await POST(createRequest(makeFile("logo.png", "image/png")))

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "document-brand",
        before: { brand_block_logo_url: "https://old-url/logo.png" },
      }),
    )
  })

  it("returns 500 when the storage upload fails", async () => {
    makeAuth({ uploadError: { message: "storage down" } })

    const res = await POST(createRequest(makeFile("logo.png", "image/png")))
    expect(res.status).toBe(500)
  })

  it("returns 500 when persisting the setting fails", async () => {
    makeAuth({ settingUpsertError: { message: "db down" } })

    const res = await POST(createRequest(makeFile("logo.png", "image/png")))
    expect(res.status).toBe(500)
  })
})
