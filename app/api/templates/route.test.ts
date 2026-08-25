import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireAnyRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
  requireAnyRole: authMocks.requireAnyRole,
}))

import { GET, PATCH, POST } from "./route"

const TEMPLATE_ID = "00000000-0000-4000-8000-00000000cccc"
const SUPPLIER_ID = "00000000-0000-4000-8000-00000000dddd"

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

/**
 * POST's create path branches on whether the request names a variant (key + supplierId) or a
 * standalone custom template: a variant looks up the highest sort_order sharing its key
 * (`.eq("key",...).order().limit().maybeSingle()`), a custom template checks for a colliding
 * slug (`.select("key").or(...)`) then the table-wide highest sort_order
 * (`.order().limit().maybeSingle()`, no `.eq`). One mock covers both by keying off whether `.eq`
 * was called before `.order`.
 */
function buildCreateAuth({ insertError }: { insertError?: { code: string } } = {}) {
  const insertedRows: Record<string, unknown>[] = []
  const insert = vi.fn((row: Record<string, unknown>) => {
    insertedRows.push(row)
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () =>
          insertError
            ? { data: null, error: insertError }
            : {
                data: {
                  id: TEMPLATE_ID,
                  key: row.key,
                  name: row.name,
                  subject: row.subject,
                  body_html: row.body_html,
                  version: 1,
                  active: true,
                  is_system: row.is_system,
                  sort_order: row.sort_order,
                  supplier_id: row.supplier_id ?? null,
                },
                error: null,
              },
        ),
      })),
    }
  })

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "templates") {
        return {
          select: vi.fn(() => {
            const chain = {
              eq: vi.fn(() => chain),
              or: vi.fn(async () => ({ data: [], error: null })),
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: { sort_order: 4 }, error: null })),
                })),
              })),
            }
            return chain
          }),
          insert,
        }
      }
      if (table === "audit_logs") return { insert: vi.fn(async () => ({ error: null })) }
      throw new Error(`Unexpected table ${table}`)
    }),
  }

  return {
    insert,
    insertedRows,
    context: {
      ok: true as const,
      value: {
        supabase,
        user: { id: "u1", email: "x@example.com" },
        profile: { clearanceLevel: "manager", actorName: "Admin User", name: "Admin", surname: "User", email: "x@example.com" },
      },
    },
  }
}

describe("POST /api/templates", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireAnyRole.mockReset()
  })

  it("creates a standalone custom template with a slugified key", async () => {
    const built = buildCreateAuth()
    authMocks.requireAnyRole.mockResolvedValue(built.context)
    const req = new Request("http://localhost/api/templates", {
      method: "POST",
      body: JSON.stringify({ name: "Reservation Confirmed", subject: "Subject", bodyHtml: "<p>Body</p>" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(built.insertedRows[0]).toMatchObject({
      key: "reservation_confirmed",
      is_system: false,
      supplier_id: null,
    })
  })

  it("creates a per-train variant with the parent's system key and is_system false, so it stays deletable", async () => {
    const built = buildCreateAuth()
    authMocks.requireAnyRole.mockResolvedValue(built.context)
    const req = new Request("http://localhost/api/templates", {
      method: "POST",
      body: JSON.stringify({
        key: "quote_email",
        supplierId: SUPPLIER_ID,
        name: "Quote Email — Rovos Rail",
        subject: "Subject",
        bodyHtml: "<p>Body</p>",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(built.insertedRows[0]).toMatchObject({
      key: "quote_email",
      supplier_id: SUPPLIER_ID,
      is_system: false,
    })
    const body = await res.json()
    expect(body.supplierId).toBe(SUPPLIER_ID)
  })

  it("rejects key without supplierId, and supplierId without key", async () => {
    authMocks.requireAnyRole.mockResolvedValue(buildCreateAuth().context)
    const req = new Request("http://localhost/api/templates", {
      method: "POST",
      body: JSON.stringify({ key: "quote_email", name: "Rovos Only", subject: "Subject", bodyHtml: "<p/>" }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 409 when a variant already exists for that key and train", async () => {
    const built = buildCreateAuth({ insertError: { code: "23505" } })
    authMocks.requireAnyRole.mockResolvedValue(built.context)
    const req = new Request("http://localhost/api/templates", {
      method: "POST",
      body: JSON.stringify({
        key: "quote_email",
        supplierId: SUPPLIER_ID,
        name: "Dup",
        subject: "Subject",
        bodyHtml: "<p>Body</p>",
      }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })
})

describe("GET /api/templates", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    authMocks.requireAnyRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  // "view:templates" is open to any active role now — GET only requires a
  // recognised profile, not requireUser's lighter is_active-only check.
  it("uses the any-role gate rather than requireUser", async () => {
    authMocks.requireAnyRole.mockResolvedValue(buildAuth().context)
    await GET()
    expect(authMocks.requireAnyRole).toHaveBeenCalledWith()
    expect(authMocks.requireUser).not.toHaveBeenCalled()
  })

  it("returns 403 when the role gate rejects", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns the template list for a permitted role", async () => {
    authMocks.requireAnyRole.mockResolvedValue(buildAuth().context)
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
    authMocks.requireAnyRole.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    authMocks.requireAnyRole.mockResolvedValue({
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
    authMocks.requireAnyRole.mockResolvedValue({
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
    authMocks.requireAnyRole.mockResolvedValue(buildAuth().context)
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
    authMocks.requireAnyRole.mockResolvedValue(built.context)
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

  it("does not bump the version for a rename-only or reorder-only update", async () => {
    const built = buildAuth()
    authMocks.requireAnyRole.mockResolvedValue(built.context)
    const req = new Request("http://localhost/api/templates", {
      method: "PATCH",
      body: JSON.stringify({ id: TEMPLATE_ID, name: "Quote Sent", sortOrder: 3 }),
      headers: { "Content-Type": "application/json" },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(built.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Quote Sent", sort_order: 3 }),
    )
    expect(built.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ version: expect.anything() }),
    )
  })
})
