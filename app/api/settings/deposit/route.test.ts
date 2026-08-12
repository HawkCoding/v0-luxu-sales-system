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

import { GET, PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

interface MockOptions {
  user?: { id: string } | null
  role?: string
  settingValue?: string | null
  refundableValue?: string | null
  upsertError?: { message: string } | null
}

function createSupabase({
  user = { id: USER_ID },
  role = "admin",
  settingValue = "25",
  refundableValue = "false",
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
                data: user ? { clearance_level: role, name: "Test", surname: "User", email: "t@t.com" } : null,
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_column: string, key: string) => ({
              maybeSingle: vi.fn(async () => {
                const value = key === "deposit_refundable" ? refundableValue : settingValue
                return { data: value !== null ? { value } : null, error: null }
              }),
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
  return new Request("http://localhost/api/settings/deposit", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/settings/deposit", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    auditMocks.writeAuditLog.mockReset()
    auditMocks.writeAuditLog.mockResolvedValue({ error: null })
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ user: null }))

    const res = await PATCH(makeRequest({ defaultDepositPercentage: 30 }))
    expect(res.status).toBe(401)
  })

  it("returns 403 for readonly role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "readonly" }))

    const res = await PATCH(makeRequest({ defaultDepositPercentage: 30 }))
    expect(res.status).toBe(403)
  })

  it("returns 403 for consultant role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "consultant" }))

    const res = await PATCH(makeRequest({ defaultDepositPercentage: 30 }))
    expect(res.status).toBe(403)
  })

  it("returns 400 for invalid percentage (out of range)", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "manager" }))

    const res = await PATCH(makeRequest({ defaultDepositPercentage: 150 }))
    expect(res.status).toBe(400)
  })

  it("returns 200 and persists the deposit percentage for manager", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "manager" }))

    const res = await PATCH(makeRequest({ defaultDepositPercentage: 30 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ defaultDepositPercentage: 30 })
  })

  it("writes an audit log entry on success", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "admin", settingValue: "25" }))

    await PATCH(makeRequest({ defaultDepositPercentage: 30 }))

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "deposit",
        action: "settings_changed",
        after: { defaultDepositPercentage: 30, depositRefundable: false },
      }),
    )
  })

  it("returns 400 when the body carries no fields", async () => {
    const supabase = createSupabase({ role: "admin" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await PATCH(makeRequest({}))

    expect(res.status).toBe(400)
    expect(supabase.upsert).not.toHaveBeenCalled()
  })

  it("persists deposit refundability on its own, leaving the percentage untouched", async () => {
    const supabase = createSupabase({ role: "admin", settingValue: "25", refundableValue: "false" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const res = await PATCH(makeRequest({ depositRefundable: true }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ defaultDepositPercentage: 25, depositRefundable: true })
    expect(supabase.upsert).toHaveBeenCalledWith([
      expect.objectContaining({ key: "deposit_refundable", value: "true" }),
    ])
  })
})

describe("GET /api/settings/deposit", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns the stored percentage and refundability", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(
      createSupabase({ role: "manager", settingValue: "30", refundableValue: "true" }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      defaultDepositPercentage: 30,
      depositRefundable: true,
      canEdit: true,
    })
  })
})
