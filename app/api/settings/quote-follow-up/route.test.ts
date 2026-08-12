import { beforeEach, describe, expect, it, vi } from "vitest"

const accessMocks = vi.hoisted(() => ({
  requireManagerSettingsAccess: vi.fn(),
  getQuoteFollowUpSettings: vi.fn(),
}))

vi.mock("@/lib/settings-access", () => ({
  requireManagerSettingsAccess: accessMocks.requireManagerSettingsAccess,
  getQuoteFollowUpSettings: accessMocks.getQuoteFollowUpSettings,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({})),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { GET, PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function createSupabase(rows: { key: string; value: string }[] = []) {
  const upsert = vi.fn(async () => ({ error: null }))
  return {
    upsert,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async () => ({ data: rows, error: null })),
      })),
      upsert,
    })),
  }
}

function grantAccess(supabase: ReturnType<typeof createSupabase>) {
  accessMocks.requireManagerSettingsAccess.mockResolvedValue({
    ok: true,
    value: { supabase, userId: USER_ID, actorName: "Test User", role: "admin" },
  })
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/quote-follow-up", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/settings/quote-follow-up", () => {
  beforeEach(() => {
    accessMocks.requireManagerSettingsAccess.mockReset()
    accessMocks.getQuoteFollowUpSettings.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("GET reads through the worker's own settings reader", async () => {
    grantAccess(createSupabase())
    accessMocks.getQuoteFollowUpSettings.mockResolvedValue({ enabled: false, cadence: [3, 7] })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ enabled: false, cadence: [3, 7] })
  })

  it("rejects an empty cadence instead of silently disabling follow-ups", async () => {
    const supabase = createSupabase()
    grantAccess(supabase)

    const res = await PATCH(makeRequest({ enabled: true, cadence: [] }))

    expect(res.status).toBe(400)
    expect(supabase.upsert).not.toHaveBeenCalled()
  })

  it("rejects a non-positive cadence day", async () => {
    grantAccess(createSupabase())

    const res = await PATCH(makeRequest({ enabled: true, cadence: [-3] }))
    expect(res.status).toBe(400)
  })

  it("persists a valid cadence", async () => {
    const supabase = createSupabase([
      { key: "quote_follow_up_enabled", value: "true" },
      { key: "quote_follow_up_cadence", value: "[3,7]" },
    ])
    grantAccess(supabase)

    const res = await PATCH(makeRequest({ enabled: true, cadence: [2, 5, 9] }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ enabled: true, cadence: [2, 5, 9] })
    expect(supabase.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ key: "quote_follow_up_enabled", value: "true" }),
      expect.objectContaining({ key: "quote_follow_up_cadence", value: "[2,5,9]" }),
    ])
  })

  it("returns 400 when no fields are supplied", async () => {
    grantAccess(createSupabase())

    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
  })
})
