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

import { PATCH } from "./route"

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

const existingRow = {
  id: RATE_TYPE_ID,
  code: "SAS",
  name: "SASPECIAL",
  sort_order: 5,
  is_default: false,
  is_standard: false,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
}

/** rate_types mock supporting the existing-row read and the update. */
function rateTypesQuery(observe?: (row: Record<string, unknown>) => void) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: existingRow, error: null }),
      }),
    }),
    update: (row: Record<string, unknown>) => {
      observe?.(row)
      return {
        eq: () => ({
          select: () => ({
            single: async () => ({ data: { ...existingRow, ...row }, error: null }),
          }),
        }),
      }
    },
  }
}

/** rate_cards count mock: head:true select awaited after .eq(). */
function rateCardsCountQuery(count: number) {
  return {
    select: () => ({
      eq: async () => ({ count, error: null }),
    }),
  }
}

function patchRequest(body: unknown) {
  return PATCH(
    new Request(`http://localhost/api/rate-types/${RATE_TYPE_ID}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: RATE_TYPE_ID }) },
  )
}

describe("PATCH /api/rate-types/[id]", () => {
  beforeEach(() => {
    sessionMocks.getUser.mockReset()
    sessionMocks.from.mockReset()
    sessionMocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  })

  it("blocks archiving while rate cards still reference the type", async () => {
    let updateCalled = false
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "rate_types") return rateTypesQuery(() => { updateCalled = true })
      if (table === "rate_cards") return rateCardsCountQuery(2)
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await patchRequest({ archived: true })
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload.error).toContain("2 rate cards still use it")
    expect(updateCalled).toBe(false)
  })

  it("archives when no rate cards reference the type", async () => {
    let observed: Record<string, unknown> | null = null
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "rate_types") return rateTypesQuery((row) => { observed = row })
      if (table === "rate_cards") return rateCardsCountQuery(0)
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await patchRequest({ archived: true })
    expect(response.status).toBe(200)
    expect(observed).not.toBeNull()
    expect(observed!.archived_at).toEqual(expect.any(String))
  })

  it("un-archives without checking rate cards", async () => {
    let observed: Record<string, unknown> | null = null
    sessionMocks.from.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "rate_types") return rateTypesQuery((row) => { observed = row })
      if (table === "rate_cards") throw new Error("rate_cards must not be queried on un-archive")
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await patchRequest({ archived: false })
    expect(response.status).toBe(200)
    expect(observed!.archived_at).toBeNull()
  })
})
