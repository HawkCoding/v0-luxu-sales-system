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

const settingsMocks = vi.hoisted(() => ({
  getEmailSignatureSettings: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  getEmailSignatureSettings: settingsMocks.getEmailSignatureSettings,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({ setting_key: "signature_brands" })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { GET, POST } from "./route"

const ALL_BRANDS = [
  { id: "b1", name: "SA Rail", sort_order: 0, enabled: true },
  { id: "b2", name: "Arnelia House", sort_order: 1, enabled: false },
]

function makeAuth(clearanceLevel: string) {
  // order() is chained twice; the final await resolves to the (possibly
  // eq-filtered) data via the thenable below.
  let filtered = ALL_BRANDS
  const chain = {
    select: vi.fn(() => chain),
    eq: (col: string, value: boolean) => {
      filtered = ALL_BRANDS.filter((b) => b.enabled === value)
      return chain
    },
    order: vi.fn(() => chain),
    then: (resolve: (v: { data: unknown; error: null }) => void) => resolve({ data: filtered, error: null }),
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "signature_brands") return chain
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "user-1", email: "u@example.com" },
      profile: { clearanceLevel, actorName: "User", name: "U", surname: "L", email: "u@example.com" },
    },
  })

  return { supabase }
}

describe("GET /api/settings/signature-brands", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
    settingsMocks.getEmailSignatureSettings.mockReset()
    settingsMocks.getEmailSignatureSettings.mockResolvedValue({ signature_enabled: "true" })
  })

  it("returns the auth failure response when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("a non-admin only sees enabled brands", async () => {
    makeAuth("consultant")

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.brands).toHaveLength(1)
    expect(body.brands[0].name).toBe("SA Rail")
    expect(body.enabled).toBe(true)
  })

  it("an admin sees every brand, including disabled ones", async () => {
    makeAuth("admin")

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.brands).toHaveLength(2)
  })
})

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/signature-brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeCreateSupabase(existingCount: number) {
  // Query 1: the cap count (a thenable). Query 2: max sort_order. Query 3:
  // the slug-uniqueness check (immediately free — no collision to resolve).
  // Query 4: the insert. Each .from() call gets the next chain in sequence.
  let call = 0
  const supabase = {
    from: vi.fn(() => {
      call += 1
      const step = call
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (step === 2) return { data: existingCount > 0 ? { sort_order: existingCount - 1 } : null, error: null }
          return { data: null, error: null } // slug check: always free
        }),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "new-brand", name: "Arnelia House", slug: "arnelia-house", sort_order: existingCount, enabled: true },
              error: null,
            })),
          })),
        })),
        then: (resolve: (v: { count: number; error: null }) => void) => resolve({ count: existingCount, error: null }),
      }
      return chain
    }),
  }
  return supabase
}

describe("POST /api/settings/signature-brands", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("403s a non-admin", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(makeRequest({ name: "Arnelia House" }))
    expect(res.status).toBe(403)
  })

  it("409s when 10 brands already exist", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: makeCreateSupabase(10),
        user: { id: "admin-1", email: "a@example.com" },
        profile: { clearanceLevel: "admin", actorName: "Admin", name: "A", surname: "L", email: "a@example.com" },
      },
    })

    const res = await POST(makeRequest({ name: "Arnelia House" }))
    expect(res.status).toBe(409)
  })

  it("creates a brand and writes an audit log entry when under the cap", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: makeCreateSupabase(3),
        user: { id: "admin-1", email: "a@example.com" },
        profile: { clearanceLevel: "admin", actorName: "Admin", name: "A", surname: "L", email: "a@example.com" },
      },
    })

    const res = await POST(makeRequest({ name: "Arnelia House" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.name).toBe("Arnelia House")
    expect(auditMocks.writeAuditLog).toHaveBeenCalled()
  })
})
