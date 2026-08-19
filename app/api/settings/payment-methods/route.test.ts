import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireUser: authMocks.requireUser,
  requireRole: authMocks.requireRole,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({ setting_key: "payment_methods" })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { GET, POST } from "./route"

const ALL_METHODS = [
  { id: "m1", name: "Primary", enabled: true, is_default: true, sort_order: 0, bank_name: null },
  { id: "m2", name: "Secondary", enabled: false, is_default: false, sort_order: 1, bank_name: null },
]

function makeReadAuth(clearanceLevel: string) {
  const { supabase } = createSupabaseMock({ payment_methods: ALL_METHODS })
  authMocks.requireUser.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "user-1", email: "u@example.com" },
      profile: { clearanceLevel, actorName: "User", name: "U", surname: "L", email: "u@example.com" },
    },
  })
}

describe("GET /api/settings/payment-methods", () => {
  beforeEach(() => {
    authMocks.requireUser.mockReset()
  })

  it("returns the auth failure response when unauthenticated", async () => {
    authMocks.requireUser.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("a non-admin only sees enabled methods, reduced to the picker shape", async () => {
    makeReadAuth("consultant")

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.methods).toHaveLength(1)
    expect(body.methods[0]).toEqual({ id: "m1", name: "Primary", enabled: true, isDefault: true, sortOrder: 0 })
  })

  it("an admin sees every method, including disabled ones, with full fields", async () => {
    makeReadAuth("admin")

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.methods).toHaveLength(2)
    expect(body.methods[1]).toMatchObject({ id: "m2", enabled: false, bankName: null })
  })
})

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/payment-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// The generic Supabase test double doesn't compute `{ count: "exact", head:
// true }`, so the cap check is exercised against a small hand-rolled chain,
// same approach as the signature-brands POST test.
function makeCreateSupabase(existingCount: number) {
  let call = 0
  return {
    from: vi.fn(() => {
      call += 1
      const step = call
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: step === 2 && existingCount > 0 ? { sort_order: existingCount - 1 } : null,
          error: null,
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: { id: "new-method", name: "Secondary", sort_order: existingCount, enabled: true, is_default: existingCount === 0 },
              error: null,
            })),
          })),
        })),
        then: (resolve: (v: { count: number; error: null }) => void) => resolve({ count: existingCount, error: null }),
      }
      return chain
    }),
  }
}

describe("POST /api/settings/payment-methods", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("403s a non-admin/manager", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await POST(makeRequest({ name: "Secondary" }))
    expect(res.status).toBe(403)
  })

  it("409s when 10 methods already exist", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: makeCreateSupabase(10),
        user: { id: "admin-1", email: "a@example.com" },
        profile: { clearanceLevel: "admin", actorName: "Admin", name: "A", surname: "L", email: "a@example.com" },
      },
    })

    const res = await POST(makeRequest({ name: "Secondary" }))
    expect(res.status).toBe(409)
  })

  it("creates the first method as the default and writes an audit log entry", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: makeCreateSupabase(0),
        user: { id: "admin-1", email: "a@example.com" },
        profile: { clearanceLevel: "admin", actorName: "Admin", name: "A", surname: "L", email: "a@example.com" },
      },
    })

    const res = await POST(makeRequest({ name: "Secondary" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.isDefault).toBe(true)
    expect(auditMocks.writeAuditLog).toHaveBeenCalled()
  })
})
