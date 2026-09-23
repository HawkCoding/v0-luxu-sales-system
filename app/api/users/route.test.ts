import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
  createServiceClient: supabaseMocks.createServiceClient,
}))

import { GET, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function makeSessionClient(role: string | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: role !== null ? { id: USER_ID } : null },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: role ? { name: "Test", surname: "User", clearance_level: role, email: "t@t.com" } : null,
                error: null,
              })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe("GET /api/users — role enforcement", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient(null))
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 403 for consultant role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("consultant"))
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns 403 for readonly role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("readonly"))
    const res = await GET()
    expect(res.status).toBe(403)
  })
})

/** Admin session that also answers the list query GET /api/users runs. */
function makeAdminListSessionClient(rows: Array<Record<string, unknown>>) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { name: "Test", surname: "User", clearance_level: "admin", email: "t@t.com" },
            error: null,
          })),
        })),
        order: vi.fn(async () => ({ data: rows, error: null })),
      })),
    })),
  }
}

describe("GET /api/users — reporting access", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns canViewReporting per user, treating a missing value as off", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(
      makeAdminListSessionClient([
        {
          user_id: USER_ID,
          email: "t@t.com",
          name: "Test",
          surname: "User",
          clearance_level: "admin",
          is_active: true,
          can_view_reporting: true,
        },
        {
          user_id: "00000000-0000-4000-8000-000000000002",
          email: "c@t.com",
          name: "Con",
          surname: null,
          clearance_level: "consultant",
          is_active: true,
          can_view_reporting: null,
        },
      ]),
    )

    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { users: Array<{ canViewReporting: boolean; isCurrentUser: boolean }> }
    expect(body.users.map((u) => u.canViewReporting)).toEqual([true, false])
    expect(body.users[0].isCurrentUser).toBe(true)
  })
})

function makeCreateServiceClient() {
  const profileUpsert = vi.fn(async (_row: Record<string, unknown>, _opts?: unknown) => ({ error: null }))
  const auditInsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }))
  const createUser = vi.fn(async () => ({
    data: { user: { id: "00000000-0000-4000-8000-000000000009" } },
    error: null,
  }))
  const client = {
    auth: { admin: { createUser, deleteUser: vi.fn() } },
    from: vi.fn((table: string) => {
      if (table === "profiles") return { upsert: profileUpsert }
      if (table === "audit_logs") return { insert: auditInsert }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
  return { client, profileUpsert, auditInsert }
}

function createRequest(extra: Record<string, unknown> = {}) {
  return POST(
    new Request("http://localhost/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: "New",
        email: "new@x.com",
        clearanceLevel: "consultant",
        password: "secret-password-123",
        ...extra,
      }),
    }),
  )
}

describe("POST /api/users — reporting access", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
    supabaseMocks.createServiceClient.mockReset()
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("admin"))
  })

  it("defaults reporting access to off", async () => {
    const { client, profileUpsert } = makeCreateServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await createRequest()

    expect(res.status).toBe(201)
    expect(profileUpsert.mock.calls[0][0]).toMatchObject({ can_view_reporting: false })
    await expect(res.json()).resolves.toMatchObject({ user: { canViewReporting: false } })
  })

  it("creates the user with reporting on when requested", async () => {
    const { client, profileUpsert, auditInsert } = makeCreateServiceClient()
    supabaseMocks.createServiceClient.mockReturnValue(client)

    const res = await createRequest({ canViewReporting: true })

    expect(res.status).toBe(201)
    expect(profileUpsert.mock.calls[0][0]).toMatchObject({ can_view_reporting: true })
    expect(auditInsert.mock.calls[0][0]).toMatchObject({
      action: "user_created",
      meta_json: { can_view_reporting: true },
    })
  })

  it("rejects a non-boolean value with 400", async () => {
    const res = await createRequest({ canViewReporting: "yes" })
    expect(res.status).toBe(400)
    expect(supabaseMocks.createServiceClient).not.toHaveBeenCalled()
  })
})

describe("POST /api/users — role enforcement", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient(null))
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({ name: "New", email: "new@x.com", clearanceLevel: "consultant", password: "secret123" }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for consultant role", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue(makeSessionClient("consultant"))
    const res = await POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        body: JSON.stringify({ name: "New", email: "new@x.com", clearanceLevel: "consultant", password: "secret123" }),
      }),
    )
    expect(res.status).toBe(403)
  })
})
