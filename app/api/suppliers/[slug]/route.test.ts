import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const helperMocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  loadSupplierDetail: vi.fn(),
  deleteInChunks: vi.fn(),
  checkDeletionDependencies: vi.fn(),
  makeUuid: vi.fn(),
  supabaseFrom: vi.fn(),
}))

vi.mock("../helpers", () => ({
  allowedRoles: new Set(["admin", "manager"]),
  deleteInChunks: helperMocks.deleteInChunks,
  checkDeletionDependencies: helperMocks.checkDeletionDependencies,
  loadSupplierDetail: helperMocks.loadSupplierDetail,
  makeUuid: helperMocks.makeUuid,
  requireAuthenticatedUser: helperMocks.requireAuthenticatedUser,
}))

import { DELETE, GET, PATCH } from "./route"

const USER_ID = "00000000-0000-4000-8000-000000000001"
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000010"
const SUITE_TYPE_ID = "00000000-0000-4000-8000-000000000011"
const EMAIL_ID = "00000000-0000-4000-8000-000000000012"

const supplierRow = {
  id: SUPPLIER_ID,
  slug: "test-supplier",
  kind: "hotel_property",
  status: "active",
  name: "Test Supplier",
  email: "ops@example.com",
  phone: null,
  website: null,
  location: null,
  notes: null,
  active: true,
  single_supplement_pct: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
}

function mockAuth() {
  helperMocks.requireAuthenticatedUser.mockResolvedValue({
    supabase: { from: helperMocks.supabaseFrom },
    user: { id: USER_ID },
  })
}

function mockSupplierDetail(overrides: Partial<typeof supplierRow> = {}) {
  helperMocks.loadSupplierDetail.mockResolvedValue({
    supplier: { ...supplierRow, ...overrides },
    suiteTypes: [
      {
        id: SUITE_TYPE_ID,
        supplier_id: SUPPLIER_ID,
        name: "Suite",
        active: true,
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    emails: [
      {
        id: EMAIL_ID,
        supplier_id: SUPPLIER_ID,
        email: "ops@example.com",
        label: "General",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    routes: [],
    rateCards: [],
    locations: [],
    bedroomTypes: [],
    bedroomLayouts: [],
    bathroomTypes: [],
    suiteTypeBedroomTypes: [],
    suiteTypeBedroomLayouts: [],
    suiteTypeBathroomTypes: [],
    rateTypes: [],
  })
}

function profileQuery(clearanceLevel: string) {
  return {
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { clearance_level: clearanceLevel }, error: null }),
      }),
    }),
  }
}

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

  it("returns supplier detail payload", async () => {
    mockAuth()
    mockSupplierDetail()

    const response = await GET(new Request("http://localhost/api/suppliers/test-supplier"), {
      params: Promise.resolve({ slug: "test-supplier" }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      id: SUPPLIER_ID,
      slug: "test-supplier",
      name: "Test Supplier",
      suiteTypes: [{ id: SUITE_TYPE_ID }],
      emails: [{ id: EMAIL_ID }],
    })
  })
})

describe("DELETE /api/suppliers/[slug]", () => {
  beforeEach(() => {
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadSupplierDetail.mockReset()
    helperMocks.supabaseFrom.mockReset()
    helperMocks.checkDeletionDependencies.mockReset()
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
  })

  it("blocks suppliers with referenced route or suite type dependencies", async () => {
    mockAuth()
    mockSupplierDetail()
    helperMocks.checkDeletionDependencies.mockResolvedValue([
      { table: "routes", ids: ["route-1"], referencedBy: "bookings" },
    ])
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                neq: async () => ({ count: 0, error: null }),
              }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await DELETE(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: "Cannot delete supplier while route or suite type records are still referenced.",
    })
  })

  it("returns 204 on successful delete", async () => {
    const deleteEqMock = vi.fn(async () => ({ error: null }))
    mockAuth()
    mockSupplierDetail()
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("admin")
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                neq: async () => ({ count: 0, error: null }),
              }),
            }),
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

    const response = await DELETE(new Request("http://localhost/api/suppliers/test"), {
      params: Promise.resolve({ slug: "test" }),
    })

    expect(response.status).toBe(204)
    expect(deleteEqMock).toHaveBeenCalledWith("id", SUPPLIER_ID)
  })
})

describe("PATCH /api/suppliers/[slug]", () => {
  beforeEach(() => {
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadSupplierDetail.mockReset()
    helperMocks.supabaseFrom.mockReset()
    helperMocks.deleteInChunks.mockReset()
    helperMocks.checkDeletionDependencies.mockReset()
    helperMocks.makeUuid.mockReset()
    helperMocks.deleteInChunks.mockResolvedValue({ error: null })
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
    helperMocks.makeUuid.mockReturnValue("00000000-0000-4000-8000-000000000099")
  })

  it("returns 409 on optimistic concurrency mismatch", async () => {
    mockAuth()
    mockSupplierDetail()
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
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
          emails: [{ id: EMAIL_ID, email: "ops@example.com", label: "General" }],
          suiteTypes: [{ id: SUITE_TYPE_ID, name: "Suite", active: true }],
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: "STALE_VERSION" })
  })

  it("updates supplier metadata, emails, and suite types", async () => {
    const supplierUpdatePayloads: Array<Record<string, unknown>> = []
    const supplierMaybeSingle = vi.fn(async () => ({
      data: { updated_at: "2026-01-03T00:00:00.000Z" },
      error: null,
    }))
    const supplierEqMock = vi.fn()
    const supplierUpdateQuery = {
      eq: supplierEqMock,
      select: () => ({ maybeSingle: supplierMaybeSingle }),
    }
    supplierEqMock.mockReturnValue(supplierUpdateQuery)

    const emailUpsert = vi.fn(async () => ({ error: null }))
    const suiteTypeUpsert = vi.fn(async () => ({ error: null }))

    mockAuth()
    mockSupplierDetail()
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "suppliers") {
        return {
          update: (payload: Record<string, unknown>) => {
            supplierUpdatePayloads.push(payload)
            return supplierUpdateQuery
          },
        }
      }
      if (table === "supplier_emails") {
        return {
          upsert: emailUpsert,
        }
      }
      if (table === "suite_types") {
        return {
          upsert: suiteTypeUpsert,
        }
      }
      if (
        table === "suite_type_bedroom_types" ||
        table === "suite_type_bedroom_layouts" ||
        table === "suite_type_bathroom_types"
      ) {
        return {
          delete: () => ({ in: async () => ({ error: null }) }),
          insert: async () => ({ error: null }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
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
          singleSupplementPct: 12.5,
          active: true,
          emails: [{ id: EMAIL_ID, email: "ops@example.com", label: "General" }],
          suiteTypes: [{ id: SUITE_TYPE_ID, name: "Suite", active: true }],
          expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(200)
    expect(supplierUpdatePayloads[0]).toMatchObject({
      single_supplement_pct: 12.5,
    })
    expect(emailUpsert).toHaveBeenCalled()
    expect(suiteTypeUpsert).toHaveBeenCalled()
  })

  it("accepts vocabulary + suite_type variant memberships round-trip", async () => {
    const BEDROOM_TYPE_ID = "00000000-0000-4000-8000-0000000000a1"
    const BEDROOM_LAYOUT_ID = "00000000-0000-4000-8000-0000000000a2"
    const BATHROOM_TYPE_ID = "00000000-0000-4000-8000-0000000000a3"

    const supplierMaybeSingle = vi.fn(async () => ({
      data: { updated_at: "2026-01-03T00:00:00.000Z" },
      error: null,
    }))
    const supplierEqMock = vi.fn()
    const supplierUpdateQuery = {
      eq: supplierEqMock,
      select: () => ({ maybeSingle: supplierMaybeSingle }),
    }
    supplierEqMock.mockReturnValue(supplierUpdateQuery)

    const emailUpsert = vi.fn(async () => ({ error: null }))
    const suiteTypeUpsertPayloads: Array<unknown> = []
    const suiteTypeUpsert = vi.fn(async (payload: unknown) => {
      suiteTypeUpsertPayloads.push(payload)
      return { error: null }
    })
    const bedroomTypeUpsert = vi.fn(async () => ({ error: null }))
    const bedroomLayoutUpsert = vi.fn(async () => ({ error: null }))
    const bathroomTypeUpsert = vi.fn(async () => ({ error: null }))
    const bedroomTypeLinkInsertPayloads: Array<unknown> = []
    const bedroomTypeLinkInsert = vi.fn(async (payload: unknown) => {
      bedroomTypeLinkInsertPayloads.push(payload)
      return { error: null }
    })
    const bedroomLayoutLinkInsert = vi.fn(async () => ({ error: null }))
    const bathroomTypeLinkInsert = vi.fn(async () => ({ error: null }))

    const linkDeleteFactory = () => ({
      delete: () => ({
        in: async () => ({ error: null }),
      }),
    })

    mockAuth()
    mockSupplierDetail()
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "suppliers") {
        return {
          update: () => supplierUpdateQuery,
        }
      }
      if (table === "supplier_emails") {
        return { upsert: emailUpsert }
      }
      if (table === "suite_types") {
        return { upsert: suiteTypeUpsert }
      }
      if (table === "bedroom_types") {
        return { upsert: bedroomTypeUpsert }
      }
      if (table === "bedroom_layouts") {
        return { upsert: bedroomLayoutUpsert }
      }
      if (table === "bathroom_types") {
        return { upsert: bathroomTypeUpsert }
      }
      if (table === "suite_type_bedroom_types") {
        return { ...linkDeleteFactory(), insert: bedroomTypeLinkInsert }
      }
      if (table === "suite_type_bedroom_layouts") {
        return { ...linkDeleteFactory(), insert: bedroomLayoutLinkInsert }
      }
      if (table === "suite_type_bathroom_types") {
        return { ...linkDeleteFactory(), insert: bathroomTypeLinkInsert }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Supplier Updated",
          kind: "train_operator",
          email: "ops@example.com",
          phone: "",
          website: "",
          location: "",
          notes: "",
          singleSupplementPct: 0,
          active: true,
          emails: [{ id: EMAIL_ID, email: "ops@example.com", label: "General" }],
          suiteTypes: [
            {
              id: SUITE_TYPE_ID,
              name: "Deluxe",
              active: true,
              sortOrder: 0,
              bedroomTypeIds: [BEDROOM_TYPE_ID],
              bedroomLayoutIds: [BEDROOM_LAYOUT_ID],
              bathroomTypeIds: [BATHROOM_TYPE_ID],
            },
          ],
          bedroomTypes: [
            { id: BEDROOM_TYPE_ID, name: "Twin", sortOrder: 0 },
          ],
          bedroomLayouts: [
            { id: BEDROOM_LAYOUT_ID, name: "L-Shape", sortOrder: 0 },
          ],
          bathroomTypes: [
            { id: BATHROOM_TYPE_ID, name: "Both", sortOrder: 0 },
          ],
          expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(200)
    expect(bedroomTypeUpsert).toHaveBeenCalled()
    expect(bedroomLayoutUpsert).toHaveBeenCalled()
    expect(bathroomTypeUpsert).toHaveBeenCalled()
    expect(suiteTypeUpsert).toHaveBeenCalled()
    const suiteTypeRows = suiteTypeUpsertPayloads[0] as Array<{ sort_order: number }>
    expect(suiteTypeRows[0].sort_order).toBe(0)
    expect(bedroomTypeLinkInsert).toHaveBeenCalled()
    const linkRows = bedroomTypeLinkInsertPayloads[0] as Array<{
      suite_type_id: string
      bedroom_type_id: string
    }>
    expect(linkRows[0]).toMatchObject({
      suite_type_id: SUITE_TYPE_ID,
      bedroom_type_id: BEDROOM_TYPE_ID,
    })
  })
})
