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
  user?: { id: string; email?: string } | null
  role?: string
  isActive?: boolean
  settingValue?: string | null
  upsertError?: { message: string } | null
}

function createSupabase({
  user = { id: USER_ID, email: "admin@example.com" },
  role = "admin",
  isActive = true,
  settingValue = null,
  upsertError = null,
}: MockOptions = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: user ? { clearance_level: role, is_active: isActive, name: "Admin", surname: "User", email: "admin@example.com" } : null,
                error: null,
              })),
            })),
          })),
        }
      }

      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: settingValue === null ? null : { value: settingValue },
                error: null,
              })),
            })),
          })),
          upsert: vi.fn(async () => ({ error: upsertError })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe("/api/settings/session-timeout", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("GET returns the default timeout when no setting exists", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase())

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      sessionTimeoutMinutes: 30,
      warningMinutes: 5,
      canEdit: true,
    })
  })

  it("PATCH rejects unauthenticated users", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ user: null }))

    const response = await PATCH(
      new Request("http://localhost/api/settings/session-timeout", {
        method: "PATCH",
        body: JSON.stringify({ sessionTimeoutMinutes: 45 }),
      }),
    )

    expect(response.status).toBe(401)
  })

  it("PATCH rejects consultants (settings write is admin+manager only)", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase({ role: "consultant" }))

    const response = await PATCH(
      new Request("http://localhost/api/settings/session-timeout", {
        method: "PATCH",
        body: JSON.stringify({ sessionTimeoutMinutes: 45 }),
      }),
    )

    expect(response.status).toBe(403)
  })

  it("PATCH rejects invalid durations", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase())

    const response = await PATCH(
      new Request("http://localhost/api/settings/session-timeout", {
        method: "PATCH",
        body: JSON.stringify({ sessionTimeoutMinutes: 4 }),
      }),
    )

    expect(response.status).toBe(400)
  })

  it("PATCH saves valid admin changes", async () => {
    const supabase = createSupabase()
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await PATCH(
      new Request("http://localhost/api/settings/session-timeout", {
        method: "PATCH",
        body: JSON.stringify({ sessionTimeoutMinutes: 45 }),
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      sessionTimeoutMinutes: 45,
      warningMinutes: 5,
    })
  })

  it("PATCH writes an audit log entry on success", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createSupabase())

    await PATCH(
      new Request("http://localhost/api/settings/session-timeout", {
        method: "PATCH",
        body: JSON.stringify({ sessionTimeoutMinutes: 45 }),
      }),
    )

    expect(auditMocks.writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "Settings",
        entityId: "session_timeout",
        action: "settings_changed",
        after: { sessionTimeoutMinutes: 45 },
      }),
    )
  })
})
