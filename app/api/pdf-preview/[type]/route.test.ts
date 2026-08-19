// @vitest-environment node
// Real @react-pdf renders require the Node runtime (font subsetting breaks in jsdom).
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireAnyRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireAnyRole: authMocks.requireAnyRole,
}))

import { GET } from "./route"

function makeSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === "voucher_template") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        }
      }
      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function mockAuthOk() {
  authMocks.requireAnyRole.mockResolvedValue({
    ok: true,
    value: { supabase: makeSupabase() },
  })
}

function makeParams(type: string): { params: Promise<{ type: string }> } {
  return { params: Promise.resolve({ type }) }
}

const req = new Request("http://localhost/api/pdf-preview/voucher")

describe("GET /api/pdf-preview/[type]", () => {
  beforeEach(() => {
    authMocks.requireAnyRole.mockReset()
  })

  it("passes through 401 when unauthenticated", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await GET(req, makeParams("voucher"))
    expect(res.status).toBe(401)
  })

  it("returns 400 for an unknown preview type", async () => {
    mockAuthOk()

    const res = await GET(req, makeParams("brochure"))
    expect(res.status).toBe(400)
  })

  it("renders a voucher preview PDF inline", async () => {
    mockAuthOk()

    const res = await GET(req, makeParams("voucher"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/pdf")
    expect(res.headers.get("Content-Disposition")).toContain('inline; filename="preview-voucher.pdf"')

    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF")
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("renders a quote preview PDF", async () => {
    mockAuthOk()

    const res = await GET(req, makeParams("quote"))
    expect(res.status).toBe(200)

    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("%PDF")
  })
})
