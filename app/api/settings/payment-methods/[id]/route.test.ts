import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
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

import { DELETE, PATCH } from "./route"

function methodRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: "m1",
    name: "Primary",
    enabled: true,
    is_default: false,
    sort_order: 0,
    bank_name: null,
    bank_account_name: null,
    bank_account_number: null,
    bank_branch_code: null,
    bank_swift_code: null,
    company_address: null,
    company_reg_number: null,
    company_vat_number: null,
    company_tel: null,
    company_cell: null,
    company_fax: null,
    company_email: null,
    company_website: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeAuth(methods: MockRow[]) {
  const { supabase, store } = createSupabaseMock({ payment_methods: methods })
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "admin-1", email: "a@example.com" },
      profile: { clearanceLevel: "admin", actorName: "Admin", name: "A", surname: "L", email: "a@example.com" },
    },
  })
  return store
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/settings/payment-methods/m1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe("PATCH /api/settings/payment-methods/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("403s a non-admin/manager", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await PATCH(patchRequest({ name: "Renamed" }), params("m1"))
    expect(res.status).toBe(403)
  })

  it("404s an unknown id", async () => {
    makeAuth([methodRow()])
    const res = await PATCH(patchRequest({ name: "Renamed" }), params("does-not-exist"))
    expect(res.status).toBe(404)
  })

  it("refuses to disable the default method", async () => {
    makeAuth([methodRow({ is_default: true })])
    const res = await PATCH(patchRequest({ enabled: false }), params("m1"))
    expect(res.status).toBe(409)
  })

  it("clears the previous default when a new one is set", async () => {
    const store = makeAuth([methodRow({ id: "m1", is_default: true }), methodRow({ id: "m2", is_default: false })])

    const res = await PATCH(
      new Request("http://localhost/api/settings/payment-methods/m2", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      }),
      params("m2"),
    )

    expect(res.status).toBe(200)
    const rows = store.rows("payment_methods")
    expect(rows.find((r) => r.id === "m1")?.is_default).toBe(false)
    expect(rows.find((r) => r.id === "m2")?.is_default).toBe(true)
  })

  it("updates a bank field and writes an audit log entry", async () => {
    makeAuth([methodRow()])
    const res = await PATCH(patchRequest({ bank_name: "Standard Bank" }), params("m1"))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.bankName).toBe("Standard Bank")
    expect(auditMocks.writeAuditLog).toHaveBeenCalled()
  })
})

describe("DELETE /api/settings/payment-methods/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("refuses to delete the default method", async () => {
    makeAuth([methodRow({ is_default: true })])
    const res = await DELETE(new Request("http://localhost"), params("m1"))
    expect(res.status).toBe(409)
  })

  it("refuses to delete the last enabled method", async () => {
    makeAuth([methodRow({ id: "m1", enabled: true }), methodRow({ id: "m2", enabled: false })])
    const res = await DELETE(new Request("http://localhost"), params("m1"))
    expect(res.status).toBe(409)
  })

  it("deletes a non-default method when another enabled one remains", async () => {
    const store = makeAuth([methodRow({ id: "m1", is_default: true }), methodRow({ id: "m2", enabled: true })])
    const res = await DELETE(new Request("http://localhost"), params("m2"))

    expect(res.status).toBe(200)
    expect(store.rows("payment_methods").find((r) => r.id === "m2")).toBeUndefined()
    expect(auditMocks.writeAuditLog).toHaveBeenCalled()
  })
})
