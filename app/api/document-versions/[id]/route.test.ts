import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock("@/lib/api/auth", () => ({ requireUser: authMocks.requireUser }))

import { GET } from "./route"

const VERSION_ID = "00000000-0000-4000-8000-00000000dddd"

function call(id = VERSION_ID) {
  return GET(new Request(`http://localhost/api/document-versions/${id}`), { params: Promise.resolve({ id }) })
}

function mockAuth(row: { id: string; storage_path: string; file_name: string } | null, signError: unknown = null) {
  const createSignedUrl = vi.fn(async () => ({
    data: signError ? null : { signedUrl: "https://signed.example/copy.pdf" },
    error: signError,
  }))
  const storageFrom = vi.fn(() => ({ createSignedUrl }))
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: row, error: null })) })),
      })),
    })),
    storage: { from: storageFrom },
  }
  authMocks.requireUser.mockResolvedValue({ ok: true, value: { supabase, user: { id: "u1" } } })
  return { createSignedUrl, storageFrom }
}

describe("GET /api/document-versions/[id]", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    expect((await call()).status).toBe(401)
  })

  it("rejects a malformed id", async () => {
    mockAuth(null)
    expect((await call("nope")).status).toBe(400)
  })

  it("returns 404 for a copy that does not exist", async () => {
    mockAuth(null)
    expect((await call()).status).toBe(404)
  })

  it("signs the stored copy from the private bucket under its own file name", async () => {
    const { createSignedUrl, storageFrom } = mockAuth({
      id: VERSION_ID,
      storage_path: "booking/invoice/abc123.pdf",
      file_name: "Invoice-244453.pdf",
    })

    const res = await call()

    expect(res.status).toBe(200)
    expect(storageFrom).toHaveBeenCalledWith("document-versions")
    expect(createSignedUrl).toHaveBeenCalledWith("booking/invoice/abc123.pdf", 3600, {
      download: "Invoice-244453.pdf",
    })
    expect(await res.json()).toEqual({
      id: VERSION_ID,
      fileName: "Invoice-244453.pdf",
      signedUrl: "https://signed.example/copy.pdf",
    })
  })

  it("returns 500 when the link cannot be signed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    mockAuth({ id: VERSION_ID, storage_path: "x/y.pdf", file_name: "Y.pdf" }, { message: "Object not found" })
    expect((await call()).status).toBe(500)
    error.mockRestore()
  })
})
