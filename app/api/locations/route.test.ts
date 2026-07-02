import { beforeEach, describe, expect, it, vi } from "vitest"

const supabaseMocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSessionClient: supabaseMocks.createSessionClient,
}))

import { DELETE } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const LOCATION_ID = "00000000-0000-4000-8000-00000000aaaa"
const SUPPLIER_ID = "00000000-0000-4000-8000-00000000cccc"

interface RouteRow {
  id: string
  name: string
  supplier_id: string | null
}

interface SupplierRow {
  id: string
  name: string
  status: string
}

function makeAuth({
  routes = [],
  suppliers = [],
  deleteError = null,
}: {
  routes?: RouteRow[]
  suppliers?: SupplierRow[]
  deleteError?: unknown
} = {}) {
  const locationDelete = vi.fn(() => ({
    eq: vi.fn(async () => ({ error: deleteError })),
  }))

  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { clearance_level: "admin" },
                error: null,
              })),
            })),
          })),
        }
      }
      if (table === "routes") {
        return {
          select: vi.fn(() => ({
            or: vi.fn(async () => ({ data: routes, error: null })),
          })),
        }
      }
      if (table === "suppliers") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: suppliers, error: null })),
          })),
        }
      }
      if (table === "locations") {
        return { delete: locationDelete }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  supabaseMocks.createSessionClient.mockResolvedValue(supabase)
  return { locationDelete }
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/locations", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("DELETE /api/locations", () => {
  beforeEach(() => {
    supabaseMocks.createSessionClient.mockReset()
  })

  it("returns 401 for unauthenticated request", async () => {
    supabaseMocks.createSessionClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      },
    })

    const res = await DELETE(makeRequest({ id: LOCATION_ID }))
    expect(res.status).toBe(401)
  })

  it("returns 400 for invalid id", async () => {
    makeAuth()

    const res = await DELETE(makeRequest({ id: "not-a-uuid" }))
    expect(res.status).toBe(400)
  })

  it("deletes the location when no routes reference it", async () => {
    const { locationDelete } = makeAuth()

    const res = await DELETE(makeRequest({ id: LOCATION_ID }))
    expect(res.status).toBe(204)
    expect(locationDelete).toHaveBeenCalled()
  })

  it("returns 409 naming the blocking route and its supplier", async () => {
    makeAuth({
      routes: [{ id: "r1", name: "Cape Town → Pretoria", supplier_id: SUPPLIER_ID }],
      suppliers: [{ id: SUPPLIER_ID, name: "Rovos Rail", status: "active" }],
    })

    const res = await DELETE(makeRequest({ id: LOCATION_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('"Cape Town → Pretoria"')
    expect(body.error).toContain("Rovos Rail")
  })

  it("flags non-active suppliers in the 409 message", async () => {
    makeAuth({
      routes: [{ id: "r1", name: "Old Route", supplier_id: SUPPLIER_ID }],
      suppliers: [{ id: SUPPLIER_ID, name: "Ghost Rail", status: "inactive" }],
    })

    const res = await DELETE(makeRequest({ id: LOCATION_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain("Ghost Rail (inactive)")
  })

  it("labels orphaned routes whose supplier no longer exists", async () => {
    makeAuth({
      routes: [{ id: "r1", name: "Orphan Route", supplier_id: SUPPLIER_ID }],
      suppliers: [],
    })

    const res = await DELETE(makeRequest({ id: LOCATION_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('"Orphan Route" (deleted supplier)')
  })

  it("labels routes with no supplier link", async () => {
    makeAuth({
      routes: [{ id: "r1", name: "Package Route", supplier_id: null }],
    })

    const res = await DELETE(makeRequest({ id: LOCATION_ID }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('"Package Route" (no linked supplier)')
  })
})
