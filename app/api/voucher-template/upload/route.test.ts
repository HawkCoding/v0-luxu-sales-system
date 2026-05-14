import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

interface UploadedFile {
  path: string
  contentType?: string
  upsert?: boolean
}

type UploadOptions = Omit<UploadedFile, "path">

function createUploadRequest({
  kind,
  file,
}: {
  kind?: string
  file?: File
}): Request {
  const formData = new FormData()
  if (kind) formData.set("kind", kind)
  if (file) formData.set("file", file)

  return new Request("http://localhost/api/voucher-template/upload", {
    method: "POST",
    body: formData,
  })
}

function createSupabase({
  user = { id: USER_ID },
  role = "admin",
  templateLookupError = null,
  templateUpdateError = null,
  templateMissing = false,
}: {
  user?: { id: string } | null
  role?: string
  templateLookupError?: { message: string } | null
  templateUpdateError?: { message: string } | null
  templateMissing?: boolean
} = {}) {
  const uploads: UploadedFile[] = []
  const updates: Array<Record<string, unknown>> = []
  const auditInsert = vi.fn(async () => ({ error: null }))

  const supabase = {
    uploads,
    updates,
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string, _buffer: Uint8Array, options: UploadOptions) => {
          uploads.push({ path, ...options })
          return { error: null }
        }),
        getPublicUrl: vi.fn((path: string) => ({
          data: { publicUrl: `https://example.test/storage/v1/object/public/voucher-assets/${path}` },
        })),
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: user ? { clearance_level: role, name: "Admin", surname: "User", email: "admin@example.com" } : null,
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === "voucher_template") {
        return {
          select: () => ({
            limit: () => ({
              single: async () => ({
                data: templateMissing ? null : { id: "template-1", logo_url: null, banner_url: null },
                error: templateLookupError,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(payload)
              return { error: templateUpdateError }
            },
          }),
        }
      }

      if (table === "audit_logs") {
        return { insert: auditInsert }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
    auditInsert,
  }

  return supabase
}

describe("POST /api/voucher-template/upload", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ user: null }))

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: new File(["banner"], "banner.webp", { type: "image/webp" }),
      }),
    )

    expect(response.status).toBe(401)
  })

  it("returns 403 when the user cannot edit templates", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "consultant" }))

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: new File(["banner"], "banner.webp", { type: "image/webp" }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it("returns 400 for an invalid kind", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await POST(
      createUploadRequest({
        kind: "hero",
        file: new File(["banner"], "banner.webp", { type: "image/webp" }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it("rejects non-cropped raster uploads", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: new File(["banner"], "banner.jpg", { type: "image/jpeg" }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it("uploads a cropped banner as WebP and persists the template URL", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: new File(["banner"], "voucher-banner.webp", { type: "image/webp" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.url).toContain("/voucher-assets/banner.webp?t=")
    expect(supabase.uploads).toEqual([
      { path: "banner.webp", contentType: "image/webp", upsert: true },
    ])
    expect(supabase.updates[0]).toMatchObject({
      banner_url: expect.stringContaining("/voucher-assets/banner.webp?t="),
    })
    expect(supabase.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings_changed", entity_id: "voucher_template" }),
    )
  })

  it("returns 500 when the uploaded URL cannot be saved", async () => {
    const supabase = createSupabase({ templateUpdateError: { message: "update failed" } })
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: new File(["banner"], "voucher-banner.webp", { type: "image/webp" }),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe("update failed")
  })

  it("uploads SVG assets directly", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      createUploadRequest({
        kind: "logo",
        file: new File(["<svg />"], "logo.svg", { type: "image/svg+xml" }),
      }),
    )

    expect(response.status).toBe(200)
    expect(supabase.uploads).toEqual([
      { path: "logo.svg", contentType: "image/svg+xml", upsert: true },
    ])
    expect(supabase.updates[0]).toMatchObject({
      logo_url: expect.stringContaining("/voucher-assets/logo.svg?t="),
    })
    expect(supabase.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings_changed", entity_id: "voucher_template" }),
    )
  })
})
