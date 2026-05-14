import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
  requireUser: vi.fn(),
}))

import { PUT, GET, DELETE } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"
const PAYMENT_ID = "00000000-0000-4000-8000-00000000bbbb"
const STORAGE_PATH = `${BOOKING_ID}/${PAYMENT_ID}/proof.pdf`

function makeAuth({
  paymentFetch = { data: { id: PAYMENT_ID, booking_id: BOOKING_ID, proof_storage_path: null as string | null }, error: null } as { data: unknown; error: unknown },
  uploadResult = { error: null } as { error: unknown },
  updateResult = { error: null } as { error: unknown },
  signResult = { data: { signedUrl: "https://cdn.example.com/proof" }, error: null } as { data: unknown; error: unknown },
  removeResult = { error: null } as { error: unknown },
} = {}) {
  const auditInsert = vi.fn(async () => ({ error: null }))
  const storageUpload = vi.fn(async () => uploadResult)
  const storageSign = vi.fn(async () => signResult)
  const storageRemove = vi.fn(async () => removeResult)

  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase: {
        from: vi.fn((table: string) => {
          if (table === "payments") {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({ single: vi.fn(async () => paymentFetch) })),
              })),
              update: vi.fn(() => ({
                eq: vi.fn(async () => updateResult),
              })),
            }
          }
          if (table === "audit_logs") return { insert: auditInsert }
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
      user: { id: USER_ID, email: "x@example.com" },
      profile: { actorName: "Jane Doe", clearanceLevel: "manager" },
    },
  })

  return { auditInsert, storageUpload, storageSign, storageRemove }
}

function makeFile(name = "proof.pdf", type = "application/pdf", size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

function makeFormRequest(file: File) {
  const fd = new FormData()
  fd.append("proof", file)
  return new Request(`http://localhost/api/payments/${PAYMENT_ID}/proof`, {
    method: "PUT",
    body: fd,
  })
}

const params = Promise.resolve({ id: PAYMENT_ID })

describe("PUT /api/payments/[id]/proof", () => {
  beforeEach(() => authMocks.requireRole.mockReset())

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await PUT(makeFormRequest(makeFile()), { params })
    expect(res.status).toBe(401)
  })

  it("returns 403 when role not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await PUT(makeFormRequest(makeFile()), { params })
    expect(res.status).toBe(403)
  })

  it("returns 404 when payment not found", async () => {
    makeAuth({ paymentFetch: { data: null, error: { message: "not found" } } })
    const res = await PUT(makeFormRequest(makeFile()), { params })
    expect(res.status).toBe(404)
  })

  it("returns 400 for unsupported MIME type", async () => {
    makeAuth()
    const res = await PUT(makeFormRequest(makeFile("proof.txt", "text/plain")), { params })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/unsupported file type/i)
  })

  it("returns 400 when file exceeds 10 MB", async () => {
    makeAuth()
    const bigFile = makeFile("proof.pdf", "application/pdf", 11 * 1024 * 1024)
    const res = await PUT(makeFormRequest(bigFile), { params })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/10 MB/i)
  })

  it("uploads file, updates proof_storage_path, writes audit log", async () => {
    const { auditInsert, storageUpload } = makeAuth()
    const res = await PUT(makeFormRequest(makeFile()), { params })
    expect(res.status).toBe(200)
    const body = await res.json() as { storagePath: string }
    expect(body.storagePath).toContain(PAYMENT_ID)
    expect(storageUpload).toHaveBeenCalledWith(
      expect.stringContaining(PAYMENT_ID),
      expect.any(ArrayBuffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: true }),
    )
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_proof_uploaded", entity_id: PAYMENT_ID }),
    )
  })
})

describe("GET /api/payments/[id]/proof", () => {
  beforeEach(() => authMocks.requireRole.mockReset())

  it("returns 404 when no proof uploaded", async () => {
    makeAuth({ paymentFetch: { data: { id: PAYMENT_ID, booking_id: BOOKING_ID, proof_storage_path: null }, error: null } })
    const req = new Request(`http://localhost/api/payments/${PAYMENT_ID}/proof`)
    const res = await GET(req, { params })
    expect(res.status).toBe(404)
  })

  it("returns signed URL when proof exists", async () => {
    makeAuth({
      paymentFetch: { data: { id: PAYMENT_ID, booking_id: BOOKING_ID, proof_storage_path: STORAGE_PATH }, error: null },
    })
    const req = new Request(`http://localhost/api/payments/${PAYMENT_ID}/proof`)
    const res = await GET(req, { params })
    expect(res.status).toBe(200)
    const body = await res.json() as { signedUrl: string }
    expect(body.signedUrl).toBeTruthy()
  })
})

describe("DELETE /api/payments/[id]/proof", () => {
  beforeEach(() => authMocks.requireRole.mockReset())

  it("returns 403 when consultant (manager-only endpoint)", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request(`http://localhost/api/payments/${PAYMENT_ID}/proof`, { method: "DELETE" })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(403)
  })

  it("returns 404 when no proof to delete", async () => {
    makeAuth({ paymentFetch: { data: { id: PAYMENT_ID, booking_id: BOOKING_ID, proof_storage_path: null }, error: null } })
    const req = new Request(`http://localhost/api/payments/${PAYMENT_ID}/proof`, { method: "DELETE" })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(404)
  })

  it("removes storage file, clears proof_storage_path, writes audit log, returns 204", async () => {
    const { auditInsert, storageRemove } = makeAuth({
      paymentFetch: { data: { id: PAYMENT_ID, booking_id: BOOKING_ID, proof_storage_path: STORAGE_PATH }, error: null },
    })
    const req = new Request(`http://localhost/api/payments/${PAYMENT_ID}/proof`, { method: "DELETE" })
    const res = await DELETE(req, { params })
    expect(res.status).toBe(204)
    expect(storageRemove).toHaveBeenCalledWith([STORAGE_PATH])
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "payment_proof_deleted", entity_id: PAYMENT_ID }),
    )
  })
})
