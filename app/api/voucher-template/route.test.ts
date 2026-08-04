import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { GET, PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function createPatchRequest(body: Record<string, unknown>): Request {
  return {
    json: async () => body,
  } as Request
}

function createSupabase({
  user = { id: USER_ID },
  role = "admin",
  templateMissing = false,
  updateError = null,
}: {
  user?: { id: string } | null
  role?: string
  templateMissing?: boolean
  updateError?: { message: string } | null
} = {}) {
  const inserts: Array<Record<string, unknown>> = []
  const updates: Array<Record<string, unknown>> = []
  let templateId = templateMissing ? null : "template-1"

  return {
    inserts,
    updates,
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: user ? { clearance_level: role } : null,
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === "voucher_template") {
        return {
          select: () => ({
            maybeSingle: async () => ({
              data: templateId ? { id: templateId } : null,
              error: null,
            }),
          }),
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                inserts.push(row)
                templateId = "template-created"
                return { data: { id: templateId }, error: null }
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(payload)
              return { error: updateError }
            },
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe("GET /api/voucher-template", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ user: null }))

    const response = await GET()

    expect(response.status).toBe(401)
  })
})

describe("PATCH /api/voucher-template", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ user: null }))

    const response = await PATCH(createPatchRequest({ font_family: "Arial" }))

    expect(response.status).toBe(401)
  })

  it("returns 403 for non-admins", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "consultant" }))

    const response = await PATCH(createPatchRequest({ font_family: "Arial" }))

    expect(response.status).toBe(403)
  })

  it("returns 400 for invalid input", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase())

    const response = await PATCH(createPatchRequest({ accent_colour: "not-a-colour" }))

    expect(response.status).toBe(400)
  })

  it("updates the existing template row", async () => {
    const supabase = createSupabase()
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await PATCH(createPatchRequest({ font_family: "Arial" }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ success: true })
    expect(supabase.updates[0]).toMatchObject({ font_family: "Arial" })
    expect(supabase.inserts).toHaveLength(0)
  })

  it("self-heals by creating the singleton row when missing, then saves", async () => {
    const supabase = createSupabase({ templateMissing: true })
    createSessionClientMock.mockResolvedValue(supabase)

    const response = await PATCH(createPatchRequest({ font_family: "Arial" }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ success: true })
    expect(supabase.inserts).toHaveLength(1)
    expect(supabase.updates[0]).toMatchObject({ font_family: "Arial" })
  })
})
