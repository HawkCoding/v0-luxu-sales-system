import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

interface CreateSupabaseOptions {
  user?: { id: string } | null
  userError?: unknown
  role?: string | null
  profileError?: unknown
  existingCustomer?: { id: string } | null
}

function createSupabaseMock({
  user = { id: USER_ID },
  userError = null,
  role = "manager",
  profileError = null,
  existingCustomer = null,
}: CreateSupabaseOptions = {}) {
  const insertMock = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          id: "00000000-0000-4000-8000-000000000010",
          first_name: "Jane",
          last_name: "Smith",
          email: "jane@example.com",
          phone: null,
          country: null,
          title: null,
          notes: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      })),
    })),
  }))

  return {
    insertMock,
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user },
          error: userError,
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: role ? { clearance_level: role } : null,
                  error: profileError,
                })),
              })),
            })),
          }
        }

        if (table === "customers") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: existingCustomer,
                  error: null,
                })),
              })),
            })),
            insert: insertMock,
          }
        }

        throw new Error(`Unexpected table ${table}`)
      }),
    },
  }
}

function createPostRequest(body: unknown) {
  return new Request("http://localhost/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/customers", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    const { supabase } = createSupabaseMock({ user: null })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await POST(createPostRequest({}))

    expect(response.status).toBe(401)
  })

  it("returns 403 when user lacks customer write role", async () => {
    const { supabase, insertMock } = createSupabaseMock({ role: "consultant" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await POST(
      createPostRequest({
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
      }),
    )

    expect(response.status).toBe(403)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it("creates customers for managers", async () => {
    const { supabase, insertMock } = createSupabaseMock({ role: "manager" })
    supabaseMocks.createSessionClient.mockResolvedValue(supabase)

    const response = await POST(
      createPostRequest({
        first_name: "jane",
        last_name: "smith",
        email: "JANE@example.com",
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
      }),
    )
    expect(payload).toMatchObject({
      id: "00000000-0000-4000-8000-000000000010",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
    })
  })
})
