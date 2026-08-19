import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { requireAnyRole, requireRole, requireUser } from "./auth"

const USER_ID = "00000000-0000-4000-8000-000000000001"

interface MockOptions {
  user?: { id: string; email?: string } | null
  userError?: unknown
  profile?: { clearance_level: string; is_active?: boolean; name: string | null; surname: string | null; email: string | null } | null
  profileError?: unknown
}

function createMock({ user = { id: USER_ID, email: "u@example.com" }, userError = null, profile = { clearance_level: "manager", is_active: true, name: "Jane", surname: "Doe", email: "u@example.com" }, profileError = null }: MockOptions = {}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: userError })),
    },
    from: vi.fn((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: profile, error: profileError })),
          })),
        })),
      }
    }),
  }
}

describe("requireUser", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when no user", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createMock({ user: null }))
    const result = await requireUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it("returns 403 when no matching profile", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createMock({ profile: null }))
    const result = await requireUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns 403 when profile is inactive", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(
      createMock({
        profile: {
          clearance_level: "manager",
          is_active: false,
          name: "Jane",
          surname: "Doe",
          email: "u@example.com",
        },
      }),
    )
    const result = await requireUser()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns the profile and a friendly actor name when authenticated", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createMock())
    const result = await requireUser()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.user.id).toBe(USER_ID)
      expect(result.value.profile.actorName).toBe("Jane Doe")
      expect(result.value.profile.clearanceLevel).toBe("manager")
      expect(result.value.profile.isActive).toBe(true)
    }
  })

  it("falls back to email when name/surname are missing", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(
      createMock({ profile: { clearance_level: "manager", is_active: true, name: null, surname: null, email: "fallback@example.com" } }),
    )
    const result = await requireUser()
    if (!result.ok) throw new Error("expected success")
    expect(result.value.profile.actorName).toBe("fallback@example.com")
  })
})

describe("requireRole", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createMock({ user: null }))
    const result = await requireRole(["manager"])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })

  it("returns 403 when role is not in the allowed list", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(
      createMock({ profile: { clearance_level: "readonly", is_active: true, name: null, surname: null, email: null } }),
    )
    const result = await requireRole(["admin", "manager"])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })

  it("returns context when role matches", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(createMock())
    const result = await requireRole(["admin", "manager"])
    expect(result.ok).toBe(true)
  })
})

describe("requireAnyRole", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("allows admin, manager, and consultant", async () => {
    for (const clearance_level of ["admin", "manager", "consultant"]) {
      supabaseMocks.createSessionClient.mockResolvedValue(
        createMock({ profile: { clearance_level, is_active: true, name: "Jane", surname: "Doe", email: "u@example.com" } }),
      )
      const result = await requireAnyRole()
      expect(result.ok).toBe(true)
    }
  })

  it("rejects the retired readonly clearance level", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(
      createMock({ profile: { clearance_level: "readonly", is_active: true, name: null, surname: null, email: null } }),
    )
    const result = await requireAnyRole()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })
})
