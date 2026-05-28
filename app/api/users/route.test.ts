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
