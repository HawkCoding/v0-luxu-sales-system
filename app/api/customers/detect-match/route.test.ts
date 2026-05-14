import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { GET } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

interface MockOptions {
  user?: { id: string } | null
  emailMatch?: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | null
  phoneMatch?: { id: string; first_name: string; last_name: string; email: string; phone: string | null } | null
}

function createCustomerQuery(result: unknown) {
  const query = {
    ilike: vi.fn(() => query),
    eq: vi.fn(() => query),
    neq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: result, error: null })),
  }
  return query
}

function mockSupabase({
  user = { id: USER_ID },
  emailMatch = null,
  phoneMatch = null,
}: MockOptions = {}) {
  const emailQuery = createCustomerQuery(emailMatch)
  const phoneQuery = createCustomerQuery(phoneMatch)
  let customerQueryCount = 0

  supabaseMocks.createSessionClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : { message: "Unauthorized" },
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "customers") throw new Error(`Unexpected table ${table}`)
      return {
        select: vi.fn(() => {
          customerQueryCount += 1
          return customerQueryCount === 1 ? emailQuery : phoneQuery
        }),
      }
    }),
  })

  return { emailQuery, phoneQuery }
}

function getRequest(path: string) {
  return new Request(`http://localhost${path}`)
}

describe("GET /api/customers/detect-match", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    mockSupabase({ user: null })

    const res = await GET(getRequest("/api/customers/detect-match?email=ada@example.test"))

    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid email query", async () => {
    mockSupabase()

    const res = await GET(getRequest("/api/customers/detect-match?email=not-an-email"))

    expect(res.status).toBe(400)
  })

  it("returns an email match before checking phone", async () => {
    const { phoneQuery } = mockSupabase({
      emailMatch: {
        id: "customer-email",
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.test",
        phone: "+27110000000",
      },
      phoneMatch: {
        id: "customer-phone",
        first_name: "Grace",
        last_name: "Hopper",
        email: "grace@example.test",
        phone: "+27220000000",
      },
    })

    const res = await GET(
      getRequest("/api/customers/detect-match?email=ADA@example.test&phone=%2B27220000000"),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      match: { id: "customer-email", firstName: "Ada", email: "ada@example.test" },
    })
    expect(phoneQuery.maybeSingle).not.toHaveBeenCalled()
  })

  it("falls back to phone when email has no match", async () => {
    mockSupabase({
      emailMatch: null,
      phoneMatch: {
        id: "customer-phone",
        first_name: "Grace",
        last_name: "Hopper",
        email: "grace@example.test",
        phone: "+27220000000",
      },
    })

    const res = await GET(
      getRequest("/api/customers/detect-match?email=unknown@example.test&phone=%2B27220000000"),
    )

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      match: { id: "customer-phone", firstName: "Grace", phone: "+27220000000" },
    })
  })

  it("returns null when no email or phone is provided", async () => {
    mockSupabase()

    const res = await GET(getRequest("/api/customers/detect-match"))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ match: null })
  })
})
