import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getAttachmentMaxSizeMb: vi.fn(async () => 10),
  getAttachmentAllowedMimeTypes: vi.fn(async () => [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]),
  requireSettingsWrite: vi.fn(),
}))

const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: vi.fn(() => ({})),
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const DOCUMENT_ID = "00000000-0000-4000-8000-00000000cccc"

interface MakeAuthOptions {
  bookingFound?: boolean
  insertResult?: { data: { id: string } | null; error: unknown }
  uploadResult?: { error: unknown }
  signResult?: { data: { signedUrl: string } | null; error: unknown }
}

function makeAuth({
  bookingFound = true,
  insertResult = { data: { id: DOCUMENT_ID }, error: null },
  uploadResult = { error: null },
  signResult = { data: { signedUrl: "https://cdn.example.com/signed" }, error: null },
}: MakeAuthOptions = {}) {
  const documentsInsert = vi.fn()
  const storageUpload = vi.fn(async () => uploadResult)
  const storageSign = vi.fn(async () => signResult)
  const storageRemove = vi.fn(async () => ({ error: null }))

  documentsInsert.mockImplementation(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => insertResult),
    })),
  }))

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "bookings") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: bookingFound ? { id: BOOKING_ID } : null,
                    error: null,
                  })),
                })),
              })),
            }
          }
          if (table === "documents") return { insert: documentsInsert }
          if (table === "audit_logs") return { insert: vi.fn(async () => ({ error: null })) }
          throw new Error(`Unexpected table: ${table}`)
        }),
        storage: {
          from: vi.fn(() => ({
            upload: storageUpload,
            createSignedUrl: storageSign,
            remove: storageRemove,
          })),
        },
      },
      user: { id: USER_ID, email: "user@example.com" },
      profile: { actorName: "Jane Doe", clearanceLevel: "consultant" },
    },
  })

  return { documentsInsert, storageUpload, storageSign, storageRemove }
}

function makeFormRequest(opts: {
  file?: File | null
  bookingId?: string
  kind?: string
} = {}): Request {
  const file = opts.file === null ? null : opts.file ?? new File([new Uint8Array(1024)], "doc.pdf", { type: "application/pdf" })
  const map = new Map<string, FormDataEntryValue | null>([
    ["file", file],
    ["booking_id", opts.bookingId ?? BOOKING_ID],
    ["kind", opts.kind ?? "other"],
  ])
  return {
    formData: async () => ({
      get: (key: string) => map.get(key) ?? null,
    }),
  } as unknown as Request
}

describe("POST /api/documents/upload", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(401)
  })

  it("returns 403 when role not allowed (readonly)", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(403)
  })

  it("returns 400 when booking_id missing", async () => {
    makeAuth()
    const res = await POST(makeFormRequest({ bookingId: "" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for oversized file", async () => {
    makeAuth()
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf", { type: "application/pdf" })
    const res = await POST(makeFormRequest({ file: big }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/10 MB/i)
  })

  it("returns 400 for disallowed MIME type", async () => {
    makeAuth()
    const txt = new File([new Uint8Array(100)], "bad.txt", { type: "text/plain" })
    const res = await POST(makeFormRequest({ file: txt }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/unsupported file type/i)
  })

  it("returns 404 when booking not found", async () => {
    makeAuth({ bookingFound: false })
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(404)
  })

  it("success: uploads, inserts document, signs URL, emits audit", async () => {
    const { storageUpload, storageSign } = makeAuth()
    const res = await POST(makeFormRequest())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; signedUrl: string; fileName: string; kind: string }
    expect(body.id).toBe(DOCUMENT_ID)
    expect(body.signedUrl).toMatch(/cdn\.example\.com/)
    expect(body.fileName).toBe("doc.pdf")
    expect(body.kind).toBe("other")
    expect(storageUpload).toHaveBeenCalled()
    expect(storageSign).toHaveBeenCalled()
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "attachment_uploaded", entityType: "Booking", entityId: BOOKING_ID }),
    )
  })

  it("does not return raw storage path", async () => {
    makeAuth()
    const res = await POST(makeFormRequest())
    const body = (await res.json()) as Record<string, unknown>
    expect(body.storagePath).toBeUndefined()
    expect(body.storage_path).toBeUndefined()
  })
})
