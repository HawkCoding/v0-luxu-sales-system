import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
  requireUser: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireAnyRole: authMocks.requireAnyRole,
  requireUser: authMocks.requireUser,
}))

const auditMocks = vi.hoisted(() => ({ writeAuditLog: vi.fn(async () => ({ error: null })) }))
vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: vi.fn(() => ({})),
}))

import { GET, DELETE } from "./route"

const DOC_ID = "00000000-0000-4000-8000-00000000cccc"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const STORAGE_PATH = `${BOOKING_ID}/other/abc-def-doc.pdf`

interface DocRow {
  id: string
  booking_id: string
  kind: string
  storage_path: string | null
  file_name: string | null
  payment_id?: string | null
}

function makeUserAuth(doc: DocRow | null) {
  const storageSign = vi.fn(async () => ({ data: { signedUrl: "https://signed" }, error: null }))
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "documents") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: doc, error: null })),
                })),
              })),
            }
          }
          throw new Error(`Unexpected table: ${table}`)
        }),
        storage: { from: vi.fn(() => ({ createSignedUrl: storageSign })) },
      },
      user: { id: "u" },
      profile: { actorName: "Reader", clearanceLevel: "readonly" },
    },
  })
  return { storageSign }
}

function makeManagerAuth(doc: DocRow | null) {
  const removeFn = vi.fn(async () => ({ error: null }))
  const documentsDelete = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  const paymentsUpdate = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
  authMocks.requireAnyRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "documents") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: doc, error: null })),
                })),
              })),
              delete: documentsDelete,
            }
          }
          if (table === "payments") {
            return { update: paymentsUpdate }
          }
          throw new Error(`Unexpected table: ${table}`)
        }),
        storage: { from: vi.fn(() => ({ remove: removeFn })) },
      },
      user: { id: "manager" },
      profile: { actorName: "Manager", clearanceLevel: "manager" },
    },
  })
  return { removeFn, documentsDelete, paymentsUpdate }
}

const params = Promise.resolve({ id: DOC_ID })

describe("GET /api/documents/[id]", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireAnyRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(401)
  })

  it("returns 404 when document missing", async () => {
    makeUserAuth(null)
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(404)
  })

  it("returns signed URL for an existing attachment", async () => {
    makeUserAuth({
      id: DOC_ID,
      booking_id: BOOKING_ID,
      kind: "other",
      storage_path: STORAGE_PATH,
      file_name: "doc.pdf",
    })
    const res = await GET(new Request("http://localhost"), { params })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { signedUrl: string; fileName: string }
    expect(body.signedUrl).toMatch(/signed/)
    expect(body.fileName).toBe("doc.pdf")
  })
})

describe("DELETE /api/documents/[id]", () => {
  beforeEach(() => {
    authMocks.requireAnyRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("returns 403 when the caller has no recognised role", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 404 when not found", async () => {
    makeManagerAuth(null)
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params })
    expect(res.status).toBe(404)
  })

  it("removes storage, deletes row, audits", async () => {
    const { removeFn, documentsDelete } = makeManagerAuth({
      id: DOC_ID,
      booking_id: BOOKING_ID,
      kind: "other",
      storage_path: STORAGE_PATH,
      file_name: "doc.pdf",
    })
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params })
    expect(res.status).toBe(204)
    expect(removeFn).toHaveBeenCalledWith([STORAGE_PATH])
    expect(documentsDelete).toHaveBeenCalled()
    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "attachment_deleted", entityId: BOOKING_ID }),
    )
  })

  it("clears payments.proof_storage_path when deleting a proof_of_payment document", async () => {
    const { paymentsUpdate } = makeManagerAuth({
      id: DOC_ID,
      booking_id: BOOKING_ID,
      kind: "proof_of_payment",
      storage_path: `${BOOKING_ID}/proof_of_payment/p-abc-proof.pdf`,
      file_name: "proof.pdf",
      payment_id: "00000000-0000-4000-8000-00000000bbbb",
    })
    const res = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params })
    expect(res.status).toBe(204)
    expect(paymentsUpdate).toHaveBeenCalledWith({ proof_storage_path: null })
  })
})
