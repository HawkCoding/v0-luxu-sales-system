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

interface TestUploadFile {
  file: File
}

function createUploadRequest({
  kind,
  file,
}: {
  kind?: string
  file?: TestUploadFile
}): Request {
  return {
    formData: async () => ({
      get: (key: string) => {
        if (key === "kind") return kind ?? null
        if (key === "file") return file?.file ?? null
        return null
      },
    }),
  } as Request
}

function makeFile(name: string, type: string, content = name): TestUploadFile {
  return {
    file: new File([content], name, { type }),
  }
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
                data: user ? { clearance_level: role } : null,
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
                data: templateMissing ? null : { id: "template-1" },
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

      throw new Error(`Unexpected table ${table}`)
    }),
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
        file: makeFile("banner.webp", "image/webp", "banner"),
      }),
    )

    expect(response.status).toBe(401)
  })

  it("returns 403 when the user cannot edit templates", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "consultant" }))

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: makeFile("banner.webp", "image/webp", "banner"),
      }),
    )

    expect(response.status).toBe(403)
  })

  it("returns 400 for an invalid kind", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await POST(
      createUploadRequest({
        kind: "hero",
        file: makeFile("banner.webp", "image/webp", "banner"),
      }),
    )

    expect(response.status).toBe(400)
  })

  it("rejects non-cropped raster uploads", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: makeFile("banner.jpg", "image/jpeg", "banner"),
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
        file: makeFile("voucher-banner.webp", "image/webp", "banner"),
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
  })

  it("returns 500 when the uploaded URL cannot be saved", async () => {
    const supabase = createSupabase({ templateUpdateError: { message: "update failed" } })
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: makeFile("voucher-banner.webp", "image/webp", "banner"),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    // Raw Supabase error messages are no longer leaked to clients.
    expect(payload.error).toBe("Database error")
  })

  it("rejects SVG logo uploads", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      createUploadRequest({
        kind: "logo",
        file: makeFile("logo.svg", "image/svg+xml", "<svg />"),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Logo uploads must be cropped to PNG.")
    expect(supabase.uploads).toEqual([])
  })

  it("rejects SVG banner uploads", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await POST(
      createUploadRequest({
        kind: "banner",
        file: makeFile("banner.svg", "image/svg+xml", "<svg />"),
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Banner uploads must be cropped to WebP.")
    expect(supabase.uploads).toEqual([])
  })
})
