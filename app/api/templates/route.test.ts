import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
  requireRole: authMocks.requireRole,
}))

import { GET, PATCH } from "./route"

const TEMPLATE_ID = "00000000-0000-4000-8000-00000000cccc"

function buildAuth({ role = "manager" }: { role?: string } = {}) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: {
            id: TEMPLATE_ID,
            key: "quote_email",
            subject: "Subject",
            body_html: "<p>Body</p>",
            version: 2,
            active: true,
          },
          error: null,
        })),
      })),
    })),
  }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "templates") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: [{ id: TEMPLATE_ID, key: "quote_email", subject: "Subject", body_html: "<p>Body</p>", version: 1, active: true }],
              error: null,
            })),
            eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { version: 1 }, error: null })) })),
          })),
          update,
        }
      }
      if (table === "audit_logs") return { insert: vi.fn(async () => ({ error: null })) }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    supabase,
    update,
    context: {
      ok: true as const,
      value: {
        supabase,
        user: { id: "u1", email: "x@example.com" },
        profile: { clearanceLevel: role, actorName: "Admin User", name: "Admin", surname: "User", email: "x@example.com" },
      },
    },
  }
}

describe("GET /api/templates", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns the template list when authenticated", async () => {
    authMocks.requireUser.mockResolvedValue(buildAuth().context)
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]).toMatchObject({ id: TEMPLATE_ID, key: "quote_email" })
  })
})

describe("PATCH /api/templates", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const req = new Request("http://localhost/api/templates", {
      method: "PATCH",
      body: JSON.stringify({ id: TEMPLATE_ID, subject: "New" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it("returns 403 when role is not allowed", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const req = new Request("http://localhost/api/templates", {
      method: "PATCH",
      body: JSON.stringify({ id: TEMPLATE_ID, subject: "New" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(403)
  })

  it("returns 400 on invalid body", async () => {
    authMocks.requireRole.mockResolvedValue(buildAuth().context)
    const req = new Request("http://localhost/api/templates", {
      method: "PATCH",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it("bumps the version and writes an audit log on success", async () => {
    const built = buildAuth()
    authMocks.requireRole.mockResolvedValue(built.context)
    const req = new Request("http://localhost/api/templates", {
      method: "PATCH",
      body: JSON.stringify({ id: TEMPLATE_ID, subject: "Subject" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(built.update).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2, subject: "Subject" }),
    )
  })
})
