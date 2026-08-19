import { beforeEach, describe, expect, it, vi } from "vitest"

const sessionMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: async () => ({
    auth: { getUser: sessionMocks.getUser },
    from: sessionMocks.from,
  }),
}))

import { GET, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const RATE_TYPE_ID = "00000000-0000-4000-8000-000000000010"

function profileQuery(clearance: string) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { clearance_level: clearance }, error: null }),
      }),
    }),
  }
}

function listQuery(rows: unknown[]) {
  return {
    select: () => ({
      order: () => ({
        order: async () => ({ data: rows, error: null }),
      }),
    }),
  }
}

function maxSortQuery(highest: number | null) {
  return {
    select: () => ({
      order: () => ({
        limit: async () => ({
          data: highest === null ? [] : [{ sort_order: highest }],
          error: null,
        }),
      }),
    }),
  }
}

function insertQuery(row: Record<string, unknown> | null, error: { code?: string; message?: string } | null = null) {
  return {
    insert: () => ({
      select: () => ({
        single: async () => ({ data: row, error }),
      }),
    }),
  }
}

describe("GET /api/rate-types", () => {
  beforeEach(() => {
    sessionMocks.getUser.mockReset()
    sessionMocks.from.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "no" } })
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it("returns the list with canEdit", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "rate_types") {
        return listQuery([
          {
            id: RATE_TYPE_ID,
            code: "RAC",
            name: "Rack Rate",
            sort_order: 0,
            is_default: true,
            archived_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ])
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await GET()
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.canEdit).toBe(true)
    expect(payload.rateTypes).toEqual([
      {
        id: RATE_TYPE_ID,
        code: "RAC",
        name: "Rack Rate",
        sortOrder: 0,
        isDefault: true,
        isStandard: false,
        archivedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ])
  })

  it("gives managers read access with canEdit", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "rate_types") return listQuery([])
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await GET()
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.canEdit).toBe(true)
  })

  it("gives consultants read access without canEdit", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("consultant")
      if (table === "rate_types") return listQuery([])
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await GET()
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.canEdit).toBe(false)
  })
})

describe("POST /api/rate-types", () => {
  beforeEach(() => {
    sessionMocks.getUser.mockReset()
    sessionMocks.from.mockReset()
  })

  it("rejects readonly users with 403", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("readonly")
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await POST(
      new Request("http://localhost/api/rate-types", {
        method: "POST",
        body: JSON.stringify({ code: "TRADE", name: "Trade Rate" }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it("rejects consultants with 403", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("consultant")
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await POST(
      new Request("http://localhost/api/rate-types", {
        method: "POST",
        body: JSON.stringify({ code: "TRADE", name: "Trade Rate" }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it("allows managers to create a rate type", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "rate_types") {
        return {
          select: maxSortQuery(0).select,
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: {
                  id: RATE_TYPE_ID,
                  code: "TRADE",
                  name: "Trade Rate",
                  sort_order: 1,
                  is_default: false,
                  archived_at: null,
                  created_at: "2026-01-01T00:00:00.000Z",
                  updated_at: "2026-01-01T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await POST(
      new Request("http://localhost/api/rate-types", {
        method: "POST",
        body: JSON.stringify({ code: "TRADE", name: "Trade Rate" }),
      }),
    )
    expect(response.status).toBe(201)
  })

  it("rejects invalid code", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await POST(
      new Request("http://localhost/api/rate-types", {
        method: "POST",
        body: JSON.stringify({ code: "lowercase", name: "Invalid" }),
      }),
    )
    expect(response.status).toBe(400)
  })

  it("inserts with the next sort order", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    let observedInsert: Record<string, unknown> | null = null
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "rate_types") {
        return {
          select: maxSortQuery(2).select,
          insert: (row: Record<string, unknown>) => {
            observedInsert = row
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: RATE_TYPE_ID,
                    code: "TRADE",
                    name: "Trade Rate",
                    sort_order: 3,
                    is_default: false,
                    archived_at: null,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await POST(
      new Request("http://localhost/api/rate-types", {
        method: "POST",
        body: JSON.stringify({ code: "TRADE", name: "Trade Rate" }),
      }),
    )
    expect(response.status).toBe(201)
    expect(observedInsert).toMatchObject({ code: "TRADE", name: "Trade Rate", sort_order: 3 })
  })

  it("returns 409 on duplicate code", async () => {
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "rate_types") {
        return {
          select: maxSortQuery(0).select,
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { code: "23505", message: "dup" } }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await POST(
      new Request("http://localhost/api/rate-types", {
        method: "POST",
        body: JSON.stringify({ code: "RAC", name: "Rack" }),
      }),
    )
    expect(response.status).toBe(409)
  })
})
