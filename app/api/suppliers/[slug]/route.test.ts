import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const helperMocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  loadSupplierDetail: vi.fn(),
  queryExistingIds: vi.fn(),
  checkDeletionDependencies: vi.fn(),
  deleteInChunks: vi.fn(),
  makeUuid: vi.fn(),
  supabaseFrom: vi.fn(),
}))

vi.mock("../helpers", () => ({
  allowedRoles: new Set(["admin", "manager"]),
  buildErrorResponse: (message: string, status = 400) =>
    NextResponse.json({ error: message }, { status }),
  checkDeletionDependencies: helperMocks.checkDeletionDependencies,
  deleteInChunks: helperMocks.deleteInChunks,
  loadSupplierDetail: helperMocks.loadSupplierDetail,
  makeUuid: helperMocks.makeUuid,
  normalizeNullableDate: (value: string | null) => (value && value.trim() ? value : null),
  normalizeText: (value: string) => value.trim() || null,
  queryExistingIds: helperMocks.queryExistingIds,
  requireAuthenticatedUser: helperMocks.requireAuthenticatedUser,
}))

import { PATCH } from "./route"
import { DELETE, GET } from "./route"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const SUPPLIER_ID = "00000000-0000-0000-0000-000000000010"
const SUITE_TYPE_OLD = "00000000-0000-0000-0000-000000000011"
const SUITE_TYPE_NEW = "00000000-0000-0000-0000-000000000012"
const PACKAGE_OLD = "00000000-0000-0000-0000-000000000021"
const PACKAGE_NEW = "00000000-0000-0000-0000-000000000022"
const ROUTE_OLD = "00000000-0000-0000-0000-000000000031"
const ROUTE_NEW = "00000000-0000-0000-0000-000000000032"
const LOCATION_A = "00000000-0000-0000-0000-000000000061"
const LOCATION_B = "00000000-0000-0000-0000-000000000062"
const EMAIL_OLD = "00000000-0000-0000-0000-000000000041"
const EMAIL_NEW = "00000000-0000-0000-0000-000000000042"
const RATE_CARD_OLD = "00000000-0000-0000-0000-000000000051"

describe("PATCH /api/suppliers/[slug]", () => {
  beforeEach(() => {
    helperMocks.supabaseFrom.mockReset()
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadSupplierDetail.mockReset()
    helperMocks.queryExistingIds.mockReset()
    helperMocks.checkDeletionDependencies.mockReset()
    helperMocks.deleteInChunks.mockReset()
    helperMocks.makeUuid.mockReset()

    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table access during conflict path: ${table}`)
      }

      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { clearance_level: "manager" }, error: null }),
          }),
        }),
      }
    })

    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })

    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: { id: SUPPLIER_ID, updated_at: "2026-03-23T08:00:00.000Z" },
      packages: [{ id: PACKAGE_OLD }],
      routes: [{ id: ROUTE_OLD }],
      suiteTypes: [{ id: SUITE_TYPE_OLD }],
      emails: [{ id: EMAIL_OLD }],
      rateCards: [
        {
          id: RATE_CARD_OLD,
          package_id: PACKAGE_OLD,
          suite_type_id: SUITE_TYPE_OLD,
          route_id: ROUTE_OLD,
          valid_from: "2026-01-01",
          valid_to: null,
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      locations: [],
    })

    helperMocks.queryExistingIds.mockResolvedValue([])
    helperMocks.checkDeletionDependencies.mockResolvedValue([
      { table: "packages", ids: [PACKAGE_OLD], referencedBy: "bookings" },
    ])
    helperMocks.deleteInChunks.mockResolvedValue({ error: null })
  })

  it("returns 409 without mutating when deletion dependencies conflict", async () => {
    const request = new Request("http://localhost/api/suppliers/test-supplier", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Supplier Updated",
        kind: "hotel_property",
        email: "ops@example.com",
        phone: "",
        website: "",
        location: "",
        notes: "",
        active: true,
        emails: [{ id: EMAIL_NEW, email: "ops@example.com", label: "General" }],
        suiteTypes: [{ id: SUITE_TYPE_NEW, name: "Suite Deluxe", active: true }],
        packages: [
          {
            id: PACKAGE_NEW,
            name: "New Package",
            description: null,
            durationNights: null,
            singleSupplementPct: 0,
            currency: "ZAR",
            active: true,
            routes: [],
            rateCards: [],
          },
        ],
        expectedUpdatedAt: "2026-03-23T08:00:00.000Z",
      }),
    })

    const response = await PATCH(request, { params: Promise.resolve({ slug: "test-supplier" }) })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload).toMatchObject({
      error: "Cannot remove items that are still referenced by active bookings or offers.",
    })
    expect(helperMocks.checkDeletionDependencies).toHaveBeenCalledWith(
      expect.anything(),
      [PACKAGE_OLD],
      [ROUTE_OLD],
      [SUITE_TYPE_OLD],
    )
    expect(helperMocks.supabaseFrom).toHaveBeenCalledTimes(1)
    expect(helperMocks.supabaseFrom).toHaveBeenCalledWith("profiles")
  })
})

describe("GET /api/suppliers/[slug]", () => {
  beforeEach(() => {
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadSupplierDetail.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })

    const response = await GET(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })
    expect(response.status).toBe(401)
  })

  it("returns propagated not found when supplier is missing", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: { id: USER_ID },
    })
    helperMocks.loadSupplierDetail.mockResolvedValue({
      error: NextResponse.json({ error: "Supplier not found" }, { status: 404 }),
    })

    const response = await GET(new Request("http://localhost/api/suppliers/missing"), {
      params: Promise.resolve({ slug: "missing" }),
    })
    expect(response.status).toBe(404)
  })

  it("returns supplier detail payload", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: vi.fn() },
      user: { id: USER_ID },
    })
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: {
        id: SUPPLIER_ID,
        slug: "test-supplier",
        kind: "hotel_property",
        status: "active",
        name: "Test Supplier",
        email: null,
        phone: null,
        website: null,
        location: null,
        notes: null,
        active: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      packages: [],
      routes: [],
      suiteTypes: [],
      emails: [],
      rateCards: [],
      locations: [],
    })

    const response = await GET(new Request("http://localhost/api/suppliers/test-supplier"), {
      params: Promise.resolve({ slug: "test-supplier" }),
    })
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      id: SUPPLIER_ID,
      slug: "test-supplier",
      name: "Test Supplier",
    })
  })
})

describe("DELETE /api/suppliers/[slug]", () => {
  beforeEach(() => {
    helperMocks.supabaseFrom.mockReset()
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadSupplierDetail.mockReset()
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const response = await DELETE(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })
    expect(response.status).toBe(401)
  })

  it("returns 403 when user is not admin", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { clearance_level: "manager" }, error: null }),
          }),
        }),
      }
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })

    const response = await DELETE(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })
    expect(response.status).toBe(403)
  })

  it("returns 409 when active bookings reference supplier", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { clearance_level: "admin" }, error: null }),
            }),
          }),
        }
      }
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                neq: async () => ({ count: 1, error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: { id: SUPPLIER_ID },
      packages: [],
      routes: [],
      suiteTypes: [],
      emails: [],
      rateCards: [],
      locations: [],
    })

    const response = await DELETE(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "Cannot delete supplier with active bookings",
    })
  })

  it("returns 204 on successful delete", async () => {
    const deleteEqMock = vi.fn(async () => ({ error: null }))
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { clearance_level: "admin" }, error: null }),
            }),
          }),
        }
      }
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                neq: async () => ({ count: 0, error: null }),
              }),
            }),
            in: () => ({
              neq: () => ({
                neq: async () => ({ count: 0, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === "packages") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }
      }
      if (table === "suppliers") {
        return {
          delete: () => ({
            eq: deleteEqMock,
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: { id: SUPPLIER_ID },
      packages: [],
      routes: [],
      suiteTypes: [],
      emails: [],
      rateCards: [],
      locations: [],
    })

    const response = await DELETE(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })
    expect(response.status).toBe(204)
    expect(deleteEqMock).toHaveBeenCalledWith("id", SUPPLIER_ID)
  })
})

describe("PATCH /api/suppliers/[slug] additional scenarios", () => {
  beforeEach(() => {
    helperMocks.supabaseFrom.mockReset()
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadSupplierDetail.mockReset()
    helperMocks.queryExistingIds.mockReset()
    helperMocks.checkDeletionDependencies.mockReset()
    helperMocks.deleteInChunks.mockReset()
    helperMocks.makeUuid.mockReset()
    helperMocks.deleteInChunks.mockResolvedValue({ error: null })
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    })
    const response = await PATCH(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })
    expect(response.status).toBe(401)
  })

  it("returns 403 when profile role is not allowed", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { clearance_level: "consultant" }, error: null }),
          }),
        }),
      }
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "hotel_property" }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )
    expect(response.status).toBe(403)
  })

  it("returns 400 for invalid request payload", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { clearance_level: "manager" }, error: null }),
          }),
        }),
      }
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )
    expect(response.status).toBe(400)
  })

  it("returns 409 on optimistic concurrency mismatch", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { clearance_level: "manager" }, error: null }),
          }),
        }),
      }
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: {
        id: SUPPLIER_ID,
        updated_at: "2026-03-23T08:00:00.000Z",
      },
      packages: [],
      routes: [],
      suiteTypes: [],
      emails: [],
      rateCards: [],
      locations: [],
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Supplier Updated",
          kind: "hotel_property",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          active: true,
          emails: [],
          suiteTypes: [],
          packages: [],
          expectedUpdatedAt: "2026-03-23T08:00:01.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )
    const payload = await response.json()
    expect(response.status).toBe(409)
    expect(payload).toMatchObject({
      code: "STALE_VERSION",
      currentUpdatedAt: "2026-03-23T08:00:00.000Z",
    })
  })

  it("returns 409 for overlapping rate cards", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { clearance_level: "manager" }, error: null }),
          }),
        }),
      }
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: {
        id: SUPPLIER_ID,
        updated_at: "2026-03-23T08:00:00.000Z",
      },
      packages: [],
      routes: [],
      suiteTypes: [],
      emails: [],
      rateCards: [],
      locations: [],
    })
    helperMocks.makeUuid
      .mockReturnValueOnce(PACKAGE_NEW)
      .mockReturnValueOnce(ROUTE_OLD)
      .mockReturnValueOnce(RATE_CARD_OLD)
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000052")

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Supplier Updated",
          kind: "hotel_property",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          active: true,
          emails: [],
          suiteTypes: [{ id: SUITE_TYPE_NEW, name: "Suite", active: true }],
          packages: [
            {
              id: PACKAGE_NEW,
              name: "Package 1",
              description: null,
              durationNights: null,
              singleSupplementPct: 0,
              currency: "ZAR",
              active: true,
              routes: [
                {
                  id: ROUTE_OLD,
                  name: "R1",
                  originLocationId: "00000000-0000-0000-0000-000000000061",
                  destinationLocationId: "00000000-0000-0000-0000-000000000062",
                  active: true,
                },
              ],
              rateCards: [
                {
                  id: RATE_CARD_OLD,
                  routeId: ROUTE_OLD,
                  suiteTypeId: SUITE_TYPE_NEW,
                  pricePerPerson: 100,
                  currency: "ZAR",
                  validFrom: "2026-01-01",
                  validTo: null,
                },
                {
                  routeId: ROUTE_OLD,
                  suiteTypeId: SUITE_TYPE_NEW,
                  pricePerPerson: 120,
                  currency: "ZAR",
                  validFrom: "2026-06-01",
                  validTo: null,
                },
              ],
            },
          ],
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Overlapping rate card periods are not allowed for the same package, suite type, and route.",
    })
  })

  it("cascades route deletion to linked rate cards", async () => {
    const supplierUpdateEq = vi.fn(async () => ({ error: null }))
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { clearance_level: "manager" }, error: null }),
            }),
          }),
        }
      }
      if (table === "packages") {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        }
      }
      if (table === "suite_types") {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        }
      }
      if (table === "suppliers") {
        return {
          update: vi.fn(() => ({
            eq: supplierUpdateEq,
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.queryExistingIds.mockResolvedValue([])
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
    helperMocks.loadSupplierDetail
      .mockResolvedValueOnce({
        supplier: {
          id: SUPPLIER_ID,
          updated_at: "2026-03-23T08:00:00.000Z",
        },
        packages: [{ id: PACKAGE_OLD }],
        routes: [{ id: ROUTE_OLD, package_id: PACKAGE_OLD }],
        suiteTypes: [{ id: SUITE_TYPE_OLD }],
        emails: [],
        rateCards: [
          {
            id: RATE_CARD_OLD,
            package_id: PACKAGE_OLD,
            route_id: ROUTE_OLD,
            suite_type_id: SUITE_TYPE_OLD,
            valid_from: "2026-01-01",
            valid_to: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        locations: [],
      })
      .mockResolvedValueOnce({
        supplier: {
          id: SUPPLIER_ID,
          slug: "test-supplier",
          kind: "hotel_property",
          status: "active",
          name: "Supplier Updated",
          email: null,
          phone: null,
          website: null,
          location: null,
          notes: null,
          active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        packages: [],
        routes: [],
        suiteTypes: [],
        emails: [],
        rateCards: [],
        locations: [],
      })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Supplier Updated",
          kind: "hotel_property",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          active: true,
          emails: [],
          suiteTypes: [{ id: SUITE_TYPE_OLD, name: "Suite", active: true }],
          packages: [
            {
              id: PACKAGE_OLD,
              name: "Package 1",
              description: null,
              durationNights: null,
              singleSupplementPct: 0,
              currency: "ZAR",
              active: true,
              routes: [],
              rateCards: [],
            },
          ],
          expectedUpdatedAt: "2026-03-23T08:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(200)
    expect(helperMocks.deleteInChunks).toHaveBeenCalledWith(expect.anything(), "rate_cards", [
      RATE_CARD_OLD,
    ])
    expect(helperMocks.deleteInChunks).toHaveBeenCalledWith(expect.anything(), "routes", [ROUTE_OLD])
    expect(supplierUpdateEq).toHaveBeenCalledWith("id", SUPPLIER_ID)
  })

  it("treats stale route-linked rate cards as deletions when route is removed", async () => {
    const supplierUpdateEq = vi.fn(async () => ({ error: null }))
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { clearance_level: "manager" }, error: null }),
            }),
          }),
        }
      }
      if (table === "packages") {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        }
      }
      if (table === "suite_types") {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        }
      }
      if (table === "suppliers") {
        return {
          update: vi.fn(() => ({
            eq: supplierUpdateEq,
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.queryExistingIds.mockResolvedValue([])
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
    helperMocks.loadSupplierDetail
      .mockResolvedValueOnce({
        supplier: {
          id: SUPPLIER_ID,
          updated_at: "2026-03-23T08:00:00.000Z",
        },
        packages: [{ id: PACKAGE_OLD }],
        routes: [{ id: ROUTE_OLD, package_id: PACKAGE_OLD }],
        suiteTypes: [{ id: SUITE_TYPE_OLD }],
        emails: [],
        rateCards: [
          {
            id: RATE_CARD_OLD,
            package_id: PACKAGE_OLD,
            route_id: ROUTE_OLD,
            suite_type_id: SUITE_TYPE_OLD,
            valid_from: "2026-01-01",
            valid_to: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        locations: [],
      })
      .mockResolvedValueOnce({
        supplier: {
          id: SUPPLIER_ID,
          slug: "test-supplier",
          kind: "hotel_property",
          status: "active",
          name: "Supplier Updated",
          email: null,
          phone: null,
          website: null,
          location: null,
          notes: null,
          active: true,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        packages: [],
        routes: [],
        suiteTypes: [],
        emails: [],
        rateCards: [],
        locations: [],
      })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Supplier Updated",
          kind: "hotel_property",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          active: true,
          emails: [],
          suiteTypes: [{ id: SUITE_TYPE_OLD, name: "Suite", active: true }],
          packages: [
            {
              id: PACKAGE_OLD,
              name: "Package 1",
              description: null,
              durationNights: null,
              singleSupplementPct: 0,
              currency: "ZAR",
              active: true,
              routes: [],
              rateCards: [
                {
                  id: RATE_CARD_OLD,
                  routeId: ROUTE_OLD,
                  suiteTypeId: SUITE_TYPE_OLD,
                  pricePerPerson: 100,
                  currency: "ZAR",
                  validFrom: "2026-01-01",
                  validTo: null,
                },
              ],
            },
          ],
          expectedUpdatedAt: "2026-03-23T08:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(200)
    expect(helperMocks.deleteInChunks).toHaveBeenCalledWith(expect.anything(), "rate_cards", [
      RATE_CARD_OLD,
    ])
    expect(helperMocks.deleteInChunks).toHaveBeenCalledWith(expect.anything(), "routes", [ROUTE_OLD])
    expect(supplierUpdateEq).toHaveBeenCalledWith("id", SUPPLIER_ID)
  })

  it("returns 409 when routes upsert hits duplicate name per package (ux_routes_name_package)", async () => {
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { clearance_level: "manager" }, error: null }),
            }),
          }),
        }
      }
      if (table === "suppliers") {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }
      if (table === "packages") {
        return {
          upsert: vi.fn(async () => ({ error: null })),
        }
      }
      if (table === "routes") {
        return {
          upsert: vi.fn(async () => ({
            error: {
              code: "23505",
              details: null,
              hint: null,
              message: 'duplicate key value violates unique constraint "ux_routes_name_package"',
            },
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.queryExistingIds.mockResolvedValue([])
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: {
        id: SUPPLIER_ID,
        updated_at: "2026-03-23T08:00:00.000Z",
      },
      packages: [{ id: PACKAGE_OLD }],
      routes: [{ id: ROUTE_OLD }],
      suiteTypes: [],
      emails: [],
      rateCards: [],
      locations: [],
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Supplier Updated",
          kind: "train_operator",
          email: "",
          phone: "",
          website: "",
          location: "",
          notes: "",
          active: true,
          emails: [],
          suiteTypes: [],
          packages: [
            {
              id: PACKAGE_OLD,
              name: "Package 1",
              description: null,
              durationNights: null,
              singleSupplementPct: 0,
              currency: "ZAR",
              active: true,
              routes: [
                {
                  id: ROUTE_OLD,
                  name: "Same name",
                  originLocationId: LOCATION_A,
                  destinationLocationId: LOCATION_B,
                  active: true,
                },
                {
                  id: ROUTE_NEW,
                  name: "Same name",
                  originLocationId: LOCATION_A,
                  destinationLocationId: LOCATION_B,
                  active: true,
                },
              ],
              rateCards: [],
            },
          ],
          expectedUpdatedAt: "2026-03-23T08:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error:
        "A route with this name already exists in the same package. Use a different route name.",
    })
  })

  it("draft save forces supplier active=false and returns updated detail", async () => {
    const supplierUpdateEq = vi.fn(async () => ({ error: null }))
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { clearance_level: "manager" }, error: null }),
            }),
          }),
        }
      }
      if (table === "suppliers") {
        return {
          update: vi.fn(() => ({
            eq: supplierUpdateEq,
          })),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: { from: helperMocks.supabaseFrom },
      user: { id: USER_ID },
    })
    helperMocks.queryExistingIds.mockResolvedValue([])
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
    helperMocks.loadSupplierDetail
      .mockResolvedValueOnce({
        supplier: {
          id: SUPPLIER_ID,
          updated_at: "2026-03-23T08:00:00.000Z",
        },
        packages: [],
        routes: [],
        suiteTypes: [],
        emails: [],
        rateCards: [],
        locations: [],
      })
      .mockResolvedValueOnce({
        supplier: {
          id: SUPPLIER_ID,
          slug: "test-supplier",
          kind: "hotel_property",
          status: "draft",
          name: "",
          email: null,
          phone: null,
          website: null,
          location: null,
          notes: null,
          active: false,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        packages: [],
        routes: [],
        suiteTypes: [],
        emails: [],
        rateCards: [],
        locations: [],
      })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test?draft=true", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "hotel_property" }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(supplierUpdateEq).toHaveBeenCalledWith("id", SUPPLIER_ID)
    expect(payload).toMatchObject({ id: SUPPLIER_ID, active: false, status: "draft" })
  })
})
