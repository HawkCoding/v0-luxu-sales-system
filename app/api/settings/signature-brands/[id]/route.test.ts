import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

const authMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: authMocks.requireRole,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({ setting_key: "signature_brands" })),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { PATCH } from "./route"

const EXISTING_ROW = {
  id: "brand-1",
  slug: "sa-rail",
  name: "SA Rail",
  banner_url: null,
  banner_width: null,
  banner_height: null,
  badges: [],
  enabled: true,
  sort_order: 0,
  company_line: null,
  registration_line: null,
  trading_hours: null,
  divisions_line: null,
  confidentiality: null,
  office_address: null,
  sender_layout: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

function makeSupabase(updatedRow: Record<string, unknown>) {
  const readChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: EXISTING_ROW, error: null })),
  }
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: updatedRow, error: null })),
  }
  let call = 0
  return {
    from: vi.fn(() => {
      call += 1
      // First call (route's `existing` lookup) reads; every call after is the update.
      return call === 1 ? readChain : { update: vi.fn(() => updateChain) }
    }),
  }
}

function makeAuth(supabase: ReturnType<typeof makeSupabase>) {
  authMocks.requireRole.mockResolvedValue({
    ok: true,
    value: {
      supabase,
      user: { id: "admin-1", email: "a@example.com" },
      profile: { clearanceLevel: "admin", actorName: "Admin", name: "A", surname: "L", email: "a@example.com" },
    },
  })
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/signature-brands/brand-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: "brand-1" })

describe("PATCH /api/settings/signature-brands/[id]", () => {
  beforeEach(() => {
    authMocks.requireRole.mockReset()
    auditMocks.writeAuditLog.mockClear()
  })

  it("403s a non-admin", async () => {
    authMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const res = await PATCH(makeRequest({ companyLine: "x" }), { params })
    expect(res.status).toBe(403)
  })

  it("strips a script tag from a rich-text field before storing it", async () => {
    const supabase = makeSupabase({ ...EXISTING_ROW, company_line: "<p>hi</p>" })
    makeAuth(supabase)

    await PATCH(makeRequest({ companyLine: '<p>hi</p><script>bad()</script>' }), { params })

    const updateCall = supabase.from.mock.results[1].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ company_line: "<p>hi</p>" }))
  })

  it("keeps an allowlisted styled span in a rich-text field", async () => {
    const styled = '<p><span style="font-size:18px;color:#b42318">Big red</span></p>'
    const supabase = makeSupabase({ ...EXISTING_ROW, confidentiality: styled })
    makeAuth(supabase)

    await PATCH(makeRequest({ confidentiality: styled }), { params })

    const updateCall = supabase.from.mock.results[1].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ confidentiality: styled }))
  })

  it("sanitizes and saves senderLayout", async () => {
    const layout = "<p><strong>{{fullName}}</strong></p>"
    const supabase = makeSupabase({ ...EXISTING_ROW, sender_layout: layout })
    makeAuth(supabase)

    const res = await PATCH(makeRequest({ senderLayout: layout }), { params })
    const body = await res.json()

    const updateCall = supabase.from.mock.results[1].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ sender_layout: layout }))
    expect(body.senderLayout).toBe(layout)
  })

  it("clears an override back to 'inherit' with an explicit null", async () => {
    const supabase = makeSupabase({ ...EXISTING_ROW, company_line: null })
    makeAuth(supabase)

    await PATCH(makeRequest({ companyLine: null }), { params })

    const updateCall = supabase.from.mock.results[1].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ company_line: null }))
  })

  it("404s when the brand doesn't exist", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    }
    makeAuth(supabase as unknown as ReturnType<typeof makeSupabase>)

    const res = await PATCH(makeRequest({ companyLine: "x" }), { params })
    expect(res.status).toBe(404)
  })
})
