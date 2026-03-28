import { beforeEach, describe, expect, it, vi } from "vitest"

const createSessionClientMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: createSessionClientMock,
}))

import { DELETE, GET, POST } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"

function createSupabase({
  user = { id: USER_ID },
  authError = null,
  role = "manager",
  labels = [],
  labelsError = null,
  createLabelError = null,
  deleteError = null,
}: {
  user?: { id: string } | null
  authError?: unknown
  role?: string
  labels?: Array<{ id: string; name: string; sort_order: number }>
  labelsError?: unknown
  createLabelError?: { code?: string } | null
  deleteError?: unknown
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: authError,
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

      if (table === "supplier_email_labels") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: labels,
                error: labelsError,
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                if (createLabelError) {
                  return { data: null, error: createLabelError }
                }
                return {
                  data: { id: "label-1", name: "General", sort_order: 999 },
                  error: null,
                }
              }),
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: deleteError })),
          })),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

describe("GET /api/supplier-email-labels", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    createSessionClientMock.mockResolvedValue(
      createSupabase({ user: null, authError: { message: "Unauthorized" } }),
    )
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it("returns labels in camelCase shape", async () => {
    createSessionClientMock.mockResolvedValue(
      createSupabase({
        labels: [{ id: "l1", name: "General", sort_order: 1 }],
      }),
    )
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual([{ id: "l1", name: "General", sortOrder: 1 }])
  })
})

describe("POST /api/supplier-email-labels", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    createSessionClientMock.mockResolvedValue(
      createSupabase({ user: null, authError: { message: "Unauthorized" } }),
    )
    const response = await POST(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General" }),
      }),
    )
    expect(response.status).toBe(401)
  })

  it("returns 403 when user lacks role", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "consultant" }))
    const response = await POST(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General" }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it("returns 400 for invalid payload", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "manager" }))
    const response = await POST(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    )
    expect(response.status).toBe(400)
  })

  it("returns 201 for valid payload", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "manager" }))
    const response = await POST(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General" }),
      }),
    )
    const payload = await response.json()
    expect(response.status).toBe(201)
    expect(payload).toEqual({ id: "label-1", name: "General", sortOrder: 999 })
  })

  it("returns 409 for duplicate label names", async () => {
    createSessionClientMock.mockResolvedValue(
      createSupabase({
        role: "manager",
        createLabelError: { code: "23505" },
      }),
    )
    const response = await POST(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General" }),
      }),
    )
    expect(response.status).toBe(409)
  })
})

describe("DELETE /api/supplier-email-labels", () => {
  beforeEach(() => {
    createSessionClientMock.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    createSessionClientMock.mockResolvedValue(
      createSupabase({ user: null, authError: { message: "Unauthorized" } }),
    )
    const response = await DELETE(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }),
      }),
    )
    expect(response.status).toBe(401)
  })

  it("returns 403 when user lacks role", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "consultant" }))
    const response = await DELETE(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }),
      }),
    )
    expect(response.status).toBe(403)
  })

  it("returns 400 for invalid payload", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "manager" }))
    const response = await DELETE(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "not-a-uuid" }),
      }),
    )
    expect(response.status).toBe(400)
  })

  it("returns 204 on successful deletion", async () => {
    createSessionClientMock.mockResolvedValue(createSupabase({ role: "manager" }))
    const response = await DELETE(
      new Request("http://localhost/api/supplier-email-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }),
      }),
    )
    expect(response.status).toBe(204)
  })
})
