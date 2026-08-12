import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { GET } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function createSupabase(match: Record<string, unknown> | null = null) {
  const customerQuery = {
    ilike: () => customerQuery,
    eq: () => customerQuery,
    neq: () => customerQuery,
    limit: () => customerQuery,
    maybeSingle: async () => ({ data: match, error: null }),
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
    },
    from: vi.fn(() => ({ select: () => customerQuery })),
  }
}

function get(query: string) {
  return GET(new Request(`http://localhost/api/customers/detect-match${query}`))
}

describe("GET /api/customers/detect-match", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  // F05-7: a form that checks on every keystroke starts out blank, and a blank
  // parameter used to reach the .email() validator and 400.
  it("treats blank parameters as no identifier", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await get("?email=&phone=")

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ match: null })
  })

  it("still rejects a malformed email", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await get("?email=not-an-email")

    expect(response.status).toBe(400)
  })

  it("returns the matching customer for a known email", async () => {
    createSessionClientMock.mockResolvedValue(
      createSupabase({
        id: "customer-1",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
        phone: "+27 82 555 0202",
      }),
    )

    const response = await get("?email=jane@example.com")
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.match).toMatchObject({ id: "customer-1", firstName: "Jane" })
  })
})
