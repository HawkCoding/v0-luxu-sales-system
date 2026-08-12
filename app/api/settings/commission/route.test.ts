import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

const auditMocks = vi.hoisted(() => ({
  writeAuditLog: vi.fn(async () => ({ error: null })),
  settingAuditMeta: vi.fn(() => ({})),
}))

vi.mock("@/lib/audit-write", () => ({
  writeAuditLog: auditMocks.writeAuditLog,
  settingAuditMeta: auditMocks.settingAuditMeta,
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

interface MockOptions {
  user?: { id: string } | null
  role?: string
  commissionType?: string
  commissionValue?: string
  upsertError?: { message: string } | null
}

function createSupabase({
  user = { id: USER_ID },
  role = "admin",
  commissionType = "percent",
  commissionValue = "0",
  upsertError = null,
}: MockOptions = {}) {
  const upsert = vi.fn(async () => ({ error: upsertError }))

  return {
    upsert,
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: user
                  ? { clearance_level: role, name: "Test", surname: "User", email: "t@t.com" }
                  : null,
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({
              data: [
                { key: "default_commission_type", value: commissionType },
                { key: "default_commission_value", value: commissionValue },
              ],
              error: null,
            })),
          })),
          upsert,
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/settings/commission", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/settings/commission", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ user: null }))

    const res = await PATCH(makeRequest({ type: "percent", value: 10 }))
    expect(res.status).toBe(401)
  })

  it("returns 403 for consultant role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "consultant" }))

    const res = await PATCH(makeRequest({ type: "percent", value: 10 }))
    expect(res.status).toBe(403)
  })

  it("rejects a percent commission above 100 instead of clamping it", async () => {
    const supabase = createSupabase({ role: "admin" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await PATCH(makeRequest({ type: "percent", value: 250 }))

    expect(res.status).toBe(400)
    expect(supabase.upsert).not.toHaveBeenCalled()
  })

  it("rejects a negative commission", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "admin" }))

    const res = await PATCH(makeRequest({ type: "percent", value: -100 }))
    expect(res.status).toBe(400)
  })

  it("accepts a percent commission at the 100 boundary", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "admin" }))

    const res = await PATCH(makeRequest({ type: "percent", value: 100 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ defaultCommission: { type: "percent", value: 100 } })
  })

  it("accepts a fixed commission above 100 (the percent bound is percent-only)", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "manager" }))

    const res = await PATCH(makeRequest({ type: "fixed", value: 5500 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ defaultCommission: { type: "fixed", value: 5500 } })
  })
})
