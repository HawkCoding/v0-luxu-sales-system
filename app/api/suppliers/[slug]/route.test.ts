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
  allowedRoles: new Set(["admin", "manager", "consultant"]),
  deleteInChunks: helperMocks.deleteInChunks,
  checkDeletionDependencies: helperMocks.checkDeletionDependencies,
  describeValidationIssue: (issue: { code: string; path: (string | number)[]; message: string }) =>
    issue.code !== "custom" && issue.path.length > 0
      ? `${issue.path.join(" ")}: ${issue.message}`
      : issue.message,
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
  phone: null as string | null,
  website: null as string | null,
  location: null as string | null,
  notes: null as string | null,
  active: true,
  single_supplement_pct: 0,
  parent_supplier_id: null as string | null,
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
    stationAddresses: [],
    rateCards: [],
    locations: [],
    bedroomTypes: [],
    bedroomLayouts: [],
    bathroomTypes: [],
    suiteTypeBedroomTypes: [],
    suiteTypeBedroomLayouts: [],
    suiteTypeBathroomTypes: [],
    rateTypes: [],
    inclusionLines: [],
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
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
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
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
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

  it("does not 403 a consultant (supplier edits are open to every active role)", async () => {
    mockAuth()
    mockSupplierDetail()
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("consultant")
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
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
          active: true,
          emails: [{ id: EMAIL_ID, email: "ops@example.com", label: "General" }],
          suiteTypes: [{ id: SUITE_TYPE_ID, name: "Suite", active: true }],
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    // The role gate no longer blocks consultants; the concurrency check still
    // fires because expectedUpdatedAt doesn't match supplierRow.updated_at.
    expect(response.status).toBe(409)
  })

  it("returns 409 on optimistic concurrency mismatch", async () => {
    mockAuth()
    mockSupplierDetail()
    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
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
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
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

  it("discards free-text location for a non-train supplier, even if the client sends one", async () => {
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
      if (table === "supplier_emails") return { upsert: async () => ({ error: null }) }
      if (table === "suite_types") return { upsert: async () => ({ error: null }) }
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
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Supplier",
          kind: "hotel_property",
          email: "ops@example.com",
          phone: "",
          website: "",
          // A hotel has no reason to send text here, but the route must not trust it either way --
          // only train_operator's free text is ever written.
          location: "CT",
          notes: "",
          active: true,
          emails: [],
          suiteTypes: [],
          expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(200)
    expect(supplierUpdatePayloads[0]).toMatchObject({ location: null })
  })

  describe("linked suppliers", () => {
    const PARENT_ID = "00000000-0000-4000-8000-0000000000b1"

    function setupLinked(options: {
      parentSupplierId: string | null
      parentKind?: string
      emailUpsert: ReturnType<typeof vi.fn>
      updatePayloads: Array<Record<string, unknown>>
    }) {
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

      mockAuth()
      mockSupplierDetail({
        parent_supplier_id: options.parentSupplierId,
        phone: "+27 11 000 0000",
      })

      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") {
          return {
            update: (payload: Record<string, unknown>) => {
              options.updatePayloads.push(payload)
              return supplierUpdateQuery
            },
            // The parent lookup performed before the update.
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: PARENT_ID,
                    name: "Toyota",
                    kind: options.parentKind ?? "transfers",
                    parent_supplier_id: null,
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === "supplier_emails") return { upsert: options.emailUpsert }
        if (table === "suite_types") return { upsert: async () => ({ error: null }) }
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
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        throw new Error(`Unexpected table ${table}`)
      })
    }

    function patchBody(overrides: Record<string, unknown> = {}) {
      return JSON.stringify({
        name: "Toyota",
        kind: "hotel_property",
        email: "ops@example.com",
        phone: "+27 11 000 0000",
        website: "",
        location: "",
        notes: "",
        active: true,
        emails: [{ id: EMAIL_ID, email: "ops@example.com", label: "General" }],
        suiteTypes: [{ id: SUITE_TYPE_ID, name: "Suite", active: true }],
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        ...overrides,
      })
    }

    it("accepts a resubmission of the inherited values without writing emails", async () => {
      const emailUpsert = vi.fn(async () => ({ error: null }))
      const updatePayloads: Array<Record<string, unknown>> = []
      setupLinked({ parentSupplierId: PARENT_ID, emailUpsert, updatePayloads })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: patchBody(),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      expect(updatePayloads[0]).toMatchObject({ parent_supplier_id: PARENT_ID })
      // The email rows are the parent's, maintained by trigger -- this route leaves them alone.
      expect(emailUpsert).not.toHaveBeenCalled()
    })

    it("rejects an edit to an inherited contact field", async () => {
      const emailUpsert = vi.fn(async () => ({ error: null }))
      const updatePayloads: Array<Record<string, unknown>> = []
      setupLinked({ parentSupplierId: PARENT_ID, emailUpsert, updatePayloads })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: patchBody({ phone: "+27 11 999 9999" }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("inherited from a linked supplier"),
      })
      expect(updatePayloads).toHaveLength(0)
    })

    it("unlinks and lets the contact details be edited in the same save", async () => {
      const emailUpsert = vi.fn(async () => ({ error: null }))
      const updatePayloads: Array<Record<string, unknown>> = []
      setupLinked({ parentSupplierId: PARENT_ID, emailUpsert, updatePayloads })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: patchBody({ parentSupplierId: null, phone: "+27 21 555 5555" }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      expect(updatePayloads[0]).toMatchObject({
        parent_supplier_id: null,
        phone: "+27 21 555 5555",
      })
      expect(emailUpsert).toHaveBeenCalled()
    })

    it("rejects linking to a supplier in the same category", async () => {
      const emailUpsert = vi.fn(async () => ({ error: null }))
      const updatePayloads: Array<Record<string, unknown>> = []
      setupLinked({
        parentSupplierId: null,
        parentKind: "hotel_property",
        emailUpsert,
        updatePayloads,
      })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: patchBody({ parentSupplierId: PARENT_ID }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Link a supplier to a record in a different category.",
      })
      expect(updatePayloads).toHaveLength(0)
    })
  })

  describe("supplier emails", () => {
    const SECOND_EMAIL_ID = "00000000-0000-4000-8000-0000000000e1"

    function setup(emailUpsert: ReturnType<typeof vi.fn>) {
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

      mockAuth()
      mockSupplierDetail()
      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") return { update: () => supplierUpdateQuery }
        if (table === "supplier_emails") return { upsert: emailUpsert }
        if (table === "suite_types") return { upsert: async () => ({ error: null }) }
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
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        throw new Error(`Unexpected table ${table}`)
      })
    }

    function patchWithEmails(emails: unknown[]) {
      return PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Supplier",
            kind: "hotel_property",
            email: "",
            phone: "",
            website: "",
            location: "",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails,
            suiteTypes: [{ id: SUITE_TYPE_ID, name: "Suite", active: true }],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )
    }

    it("removes the outgoing rows before upserting, so an address can be dropped and re-added in one save", async () => {
      const emailUpsert = vi.fn(async () => ({ error: null }))
      setup(emailUpsert)

      // The stored row (EMAIL_ID) is gone from the payload and the same address comes back on a
      // new row -- exactly the shape that used to collide with the (supplier_id, lower(email))
      // unique index and 500 after the suppliers row had already been written.
      const response = await patchWithEmails([
        { id: SECOND_EMAIL_ID, email: "ops@example.com", label: "Accounts" },
      ])

      expect(response.status).toBe(200)
      expect(helperMocks.deleteInChunks).toHaveBeenCalledWith(
        expect.anything(),
        "supplier_emails",
        [EMAIL_ID],
      )
      expect(helperMocks.deleteInChunks.mock.invocationCallOrder[0]).toBeLessThan(
        emailUpsert.mock.invocationCallOrder[0],
      )
    })

    it("maps a duplicate address to a 409 naming the problem rather than a 500", async () => {
      const emailUpsert = vi.fn(async () => ({
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      }))
      setup(emailUpsert)

      const response = await patchWithEmails([
        { id: EMAIL_ID, email: "ops@example.com", label: "General" },
      ])

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining("already listed on this supplier"),
      })
    })

    it("persists the order the client sent and mirrors the first address onto the supplier", async () => {
      const emailUpsert = vi.fn(
        async (_rows: Array<{ email: string; sort_order: number }>) => ({ error: null })
      )
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
        if (table === "supplier_emails") return { upsert: emailUpsert }
        if (table === "suite_types") return { upsert: async () => ({ error: null }) }
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
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        throw new Error(`Unexpected table ${table}`)
      })

      const response = await patchWithEmails([
        { id: SECOND_EMAIL_ID, email: "accounts@example.com", label: "Accounts" },
        { id: EMAIL_ID, email: "ops@example.com", label: "General" },
      ])

      expect(response.status).toBe(200)
      const rows = emailUpsert.mock.calls[0][0]
      expect(rows.map((row) => [row.email, row.sort_order])).toEqual([
        ["accounts@example.com", 0],
        ["ops@example.com", 1],
      ])
      expect(supplierUpdatePayloads[0]).toMatchObject({ email: "accounts@example.com" })
    })
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
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
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

  it("preserves a client-provided train route name and derives only when empty", async () => {
    const ORIGIN_ID = "00000000-0000-4000-8000-0000000000b1"
    const DEST_ID = "00000000-0000-4000-8000-0000000000b2"
    const ROUTE_ID = "00000000-0000-4000-8000-0000000000b3"
    const ROUTE_ID_2 = "00000000-0000-4000-8000-0000000000b4"

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
    const routeUpsertPayloads: Array<unknown> = []
    const routeUpsert = vi.fn(async (payload: unknown) => {
      routeUpsertPayloads.push(payload)
      return { error: null }
    })
    const linkDeleteFactory = () => ({ delete: () => ({ in: async () => ({ error: null }) }) })

    mockAuth()
    helperMocks.checkDeletionDependencies.mockResolvedValue([])
    helperMocks.loadSupplierDetail.mockResolvedValue({
      supplier: { ...supplierRow, kind: "train_operator" },
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
      stationAddresses: [],
      rateCards: [],
      locations: [
        { id: ORIGIN_ID, name: "Pretoria" },
        { id: DEST_ID, name: "Cape Town" },
      ],
      bedroomTypes: [],
      bedroomLayouts: [],
      bathroomTypes: [],
      suiteTypeBedroomTypes: [],
      suiteTypeBedroomLayouts: [],
      suiteTypeBathroomTypes: [],
      rateTypes: [],
      inclusionLines: [],
    })

    helperMocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery("manager")
      if (table === "suppliers") return { update: () => supplierUpdateQuery }
      if (table === "supplier_emails") return { upsert: emailUpsert }
      if (table === "suite_types") return { upsert: suiteTypeUpsert }
      if (table === "suite_type_bedroom_types") return linkDeleteFactory()
      if (table === "suite_type_bedroom_layouts") return linkDeleteFactory()
      if (table === "suite_type_bathroom_types") return linkDeleteFactory()
      if (table === "routes") return { upsert: routeUpsert }
      if (table === "vehicle_rental_route_details") return linkDeleteFactory()
      if (table === "supplier_rate_adjustments") {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await PATCH(
      new Request("http://localhost/api/suppliers/test?draft=true", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rovos Rail",
          kind: "train_operator",
          email: "ops@example.com",
          phone: "",
          website: "",
          location: "",
          notes: "",
          singleSupplementPct: 0,
          active: true,
          emails: [{ id: EMAIL_ID, email: "ops@example.com", label: "General" }],
          suiteTypes: [{ id: SUITE_TYPE_ID, name: "Suite", active: true, sortOrder: 0 }],
          routes: [
            {
              id: ROUTE_ID,
              name: "Custom Journey Name",
              originLocationId: ORIGIN_ID,
              destinationLocationId: DEST_ID,
              directionMode: "round_trip",
              active: true,
              rateCards: [],
            },
            {
              id: ROUTE_ID_2,
              name: "   ",
              originLocationId: ORIGIN_ID,
              destinationLocationId: DEST_ID,
              directionMode: "round_trip",
              active: true,
              rateCards: [],
            },
          ],
          expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ slug: "test" }) },
    )

    expect(response.status).toBe(200)
    const routeRows = routeUpsertPayloads[0] as Array<{ name: string }>
    expect(routeRows[0].name).toBe("Custom Journey Name")
    expect(routeRows[1].name).toBe("Pretoria ↔ Cape Town")
  })

  describe("route names", () => {
    const ORIGIN_ID = "00000000-0000-4000-8000-0000000000d1"
    const DEST_ID = "00000000-0000-4000-8000-0000000000d2"
    const ROUTE_ID = "00000000-0000-4000-8000-0000000000d3"

    function setup(kind: string, options: { locationsFromDetail: boolean }) {
      const routeUpsertPayloads: Array<unknown> = []
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
      const locationLookup = vi.fn(async () => ({
        data: [
          { id: ORIGIN_ID, name: "Pretoria" },
          { id: DEST_ID, name: "Cape Town" },
        ],
        error: null,
      }))

      mockAuth()
      helperMocks.loadSupplierDetail.mockResolvedValue({
        supplier: { ...supplierRow, kind },
        suiteTypes: [],
        emails: [],
        routes: [],
        stationAddresses: [],
        rateCards: [],
        // Empty on purpose in the lookup case: a brand-new route can point at a city this
        // supplier has never used, which is not covered by loadSupplierDetail's location fetch.
        locations: options.locationsFromDetail
          ? [
              { id: ORIGIN_ID, name: "Pretoria" },
              { id: DEST_ID, name: "Cape Town" },
            ]
          : [],
        bedroomTypes: [],
        bedroomLayouts: [],
        bathroomTypes: [],
        suiteTypeBedroomTypes: [],
        suiteTypeBedroomLayouts: [],
        suiteTypeBathroomTypes: [],
        rateTypes: [],
        inclusionLines: [],
      })
      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") return { update: () => supplierUpdateQuery }
        if (table === "locations") return { select: () => ({ in: locationLookup }) }
        if (table === "supplier_emails") return { upsert: async () => ({ error: null }) }
        if (table === "suite_types") return { upsert: async () => ({ error: null }) }
        if (table === "routes") {
          return {
            upsert: async (payload: unknown) => {
              routeUpsertPayloads.push(payload)
              return { error: null }
            },
          }
        }
        if (table === "vehicle_rental_route_details") {
          return { delete: () => ({ in: async () => ({ error: null }) }) }
        }
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        if (
          table === "suite_type_bedroom_types" ||
          table === "suite_type_bedroom_layouts" ||
          table === "suite_type_bathroom_types"
        ) {
          return { delete: () => ({ in: async () => ({ error: null }) }) }
        }
        throw new Error(`Unexpected table ${table}`)
      })

      return { routeUpsertPayloads, locationLookup }
    }

    function patchWithRoute(kind: string, route: Record<string, unknown>) {
      return PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Supplier",
            kind,
            email: "",
            phone: "",
            website: "",
            location: "",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [],
            routes: [route],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )
    }

    it("derives a blank train route name on a full save, looking up cities the supplier has not used before", async () => {
      const { routeUpsertPayloads, locationLookup } = setup("train_operator", {
        locationsFromDetail: false,
      })

      const response = await patchWithRoute("train_operator", {
        id: ROUTE_ID,
        name: "",
        originLocationId: ORIGIN_ID,
        destinationLocationId: DEST_ID,
        directionMode: "one_way",
        active: true,
        rateCards: [],
      })

      expect(response.status).toBe(200)
      expect(locationLookup).toHaveBeenCalled()
      const routeRows = routeUpsertPayloads[0] as Array<{ name: string }>
      expect(routeRows[0].name).toBe("Pretoria → Cape Town")
    })

    it("still requires a name for kinds that cannot derive one", async () => {
      setup("hotel_property", { locationsFromDetail: true })

      const response = await patchWithRoute("hotel_property", {
        id: ROUTE_ID,
        name: "",
        active: true,
        rateCards: [],
      })

      expect(response.status).toBe(400)
    })

    it("derives a blank tour-operator itinerary name from its tour type, and rewrites a mismatched name on save", async () => {
      const SUITE_TYPE_ID = "00000000-0000-4000-8000-0000000000d4"
      const { routeUpsertPayloads } = setup("tour_operator", { locationsFromDetail: true })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Supplier",
            kind: "tour_operator",
            email: "",
            phone: "",
            website: "",
            location: "",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [{ id: SUITE_TYPE_ID, name: "Classic Hop-on-Hop-off Ticket", active: true }],
            routes: [
              { id: ROUTE_ID, name: "", suiteTypeId: SUITE_TYPE_ID, active: true, rateCards: [] },
            ],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      const routeRows = routeUpsertPayloads[0] as Array<{ name: string }>
      expect(routeRows[0].name).toBe("Classic Hop-on-Hop-off Ticket")
    })
  })

  describe("station addresses", () => {
    const PRETORIA_ID = "00000000-0000-4000-8000-0000000000c1"
    const CAPE_TOWN_ID = "00000000-0000-4000-8000-0000000000c2"
    const STATION_ID = "00000000-0000-4000-8000-0000000000c3"
    const STALE_STATION_ID = "00000000-0000-4000-8000-0000000000c4"

    /** Wires the mocks this group shares and returns the captured station upsert payloads. */
    function setupStationSave(kind: "train_operator" | "hotel_property") {
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

      const stationUpsertPayloads: Array<unknown> = []
      const linkDeleteFactory = () => ({ delete: () => ({ in: async () => ({ error: null }) }) })
      // Cities the pre-flight FK check will find. Anything else is treated as deleted.
      const knownLocationIds = [PRETORIA_ID, CAPE_TOWN_ID]

      mockAuth()
      helperMocks.checkDeletionDependencies.mockResolvedValue([])
      helperMocks.deleteInChunks.mockResolvedValue({ error: null })
      helperMocks.loadSupplierDetail.mockResolvedValue({
        supplier: { ...supplierRow, kind },
        suiteTypes: [],
        emails: [],
        routes: [],
        stationAddresses: [
          {
            id: STALE_STATION_ID,
            supplier_id: SUPPLIER_ID,
            location_id: CAPE_TOWN_ID,
            station_name: "Old Station",
            street_address: null,
            notes: null,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [],
        locations: [
          { id: PRETORIA_ID, name: "Pretoria" },
          { id: CAPE_TOWN_ID, name: "Cape Town" },
        ],
        bedroomTypes: [],
        bedroomLayouts: [],
        bathroomTypes: [],
        suiteTypeBedroomTypes: [],
        suiteTypeBedroomLayouts: [],
        suiteTypeBathroomTypes: [],
        rateTypes: [],
        inclusionLines: [],
      })

      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") return { update: () => supplierUpdateQuery }
        // The bare `email` field seeds a fallback supplier_emails row when `emails` is empty.
        if (table === "supplier_emails") return { upsert: async () => ({ error: null }) }
        if (table === "locations") {
          return {
            select: () => ({
              in: async (_column: string, ids: string[]) => ({
                data: ids
                  .filter((id) => knownLocationIds.includes(id))
                  .map((id) => ({ id })),
                error: null,
              }),
            }),
          }
        }
        if (table === "supplier_station_addresses") {
          return {
            upsert: async (payload: unknown) => {
              stationUpsertPayloads.push(payload)
              return { error: null }
            },
          }
        }
        if (table === "vehicle_rental_route_details") return linkDeleteFactory()
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        throw new Error(`Unexpected table ${table}`)
      })

      return { stationUpsertPayloads }
    }

    function stationSaveBody(kind: string) {
      return JSON.stringify({
        name: "Rovos Rail",
        kind,
        email: "ops@example.com",
        phone: "",
        website: "",
        location: "Pretoria",
        notes: "",
        singleSupplementPct: 0,
        active: true,
        emails: [],
        suiteTypes: [],
        routes: [],
        stationAddresses: [
          {
            id: STATION_ID,
            locationId: PRETORIA_ID,
            stationName: "Rovos Rail Station",
            streetAddress: "Capital Park",
            notes: "Check in 2h prior",
          },
        ],
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      })
    }

    it("persists a train supplier's station rows and deletes the ones no longer sent", async () => {
      const { stationUpsertPayloads } = setupStationSave("train_operator")

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: stationSaveBody("train_operator"),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      expect(stationUpsertPayloads[0]).toEqual([
        expect.objectContaining({
          id: STATION_ID,
          supplier_id: SUPPLIER_ID,
          location_id: PRETORIA_ID,
          station_name: "Rovos Rail Station",
          street_address: "Capital Park",
          notes: "Check in 2h prior",
        }),
      ])
      // The stale Cape Town row wasn't resent, so it goes -- and before the upsert, so a city
      // moved onto a fresh row can't collide on the (supplier_id, location_id) unique index.
      expect(helperMocks.deleteInChunks).toHaveBeenCalledWith(
        expect.anything(),
        "supplier_station_addresses",
        [STALE_STATION_ID],
      )
    })

    it("ignores station rows sent for a non-train supplier without deleting the stored ones", async () => {
      const { stationUpsertPayloads } = setupStationSave("hotel_property")

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: stationSaveBody("hotel_property"),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      expect(stationUpsertPayloads).toEqual([])
      // Re-categorising a train must not destroy its stations: switching back has to restore them,
      // and the editor gives no warning that anything was at stake.
      expect(helperMocks.deleteInChunks).not.toHaveBeenCalledWith(
        expect.anything(),
        "supplier_station_addresses",
        expect.anything(),
      )
    })

    it("rejects an unknown city with a 400 before deleting any stored station row", async () => {
      const { stationUpsertPayloads } = setupStationSave("train_operator")
      const UNKNOWN_CITY_ID = "11111111-1111-4111-8111-111111111111"

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Rovos Rail",
            kind: "train_operator",
            email: "ops@example.com",
            phone: "",
            website: "",
            location: "Pretoria",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [],
            routes: [],
            stationAddresses: [{ locationId: UNKNOWN_CITY_ID, stationName: "Ghost Station" }],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: "A station address references a city that no longer exists.",
      })
      // The delete runs before the upsert and the writes share no transaction, so an FK violation
      // reaching the upsert would leave the supplier with no station rows at all.
      expect(stationUpsertPayloads).toEqual([])
      expect(helperMocks.deleteInChunks).not.toHaveBeenCalledWith(
        expect.anything(),
        "supplier_station_addresses",
        expect.anything(),
      )
    })

    it("rejects two station rows for the same city with a 400", async () => {
      setupStationSave("train_operator")

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Rovos Rail",
            kind: "train_operator",
            email: "ops@example.com",
            phone: "",
            website: "",
            location: "Pretoria",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [],
            routes: [],
            stationAddresses: [
              { locationId: PRETORIA_ID, stationName: "Rovos Rail Station" },
              { locationId: PRETORIA_ID, stationName: "Duplicate Station" },
            ],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(400)
      // The schema already defines this message; the route used to swallow it and return a bare
      // "Invalid request payload" the caller could do nothing with.
      await expect(response.json()).resolves.toMatchObject({
        error: "Each city may only have one station address",
      })
    })
  })

  describe("route locations on a category change", () => {
    const ORIGIN_ID = "00000000-0000-4000-8000-0000000000d1"
    const DESTINATION_ID = "00000000-0000-4000-8000-0000000000d2"
    const ROUTE_ID = "00000000-0000-4000-8000-0000000000d3"

    it("keeps a route's stored origin and destination when the supplier is saved as a hotel", async () => {
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

      const routeUpsertPayloads: Array<unknown> = []

      mockAuth()
      helperMocks.checkDeletionDependencies.mockResolvedValue([])
      helperMocks.deleteInChunks.mockResolvedValue({ error: null })
      helperMocks.loadSupplierDetail.mockResolvedValue({
        supplier: { ...supplierRow, kind: "hotel_property" },
        suiteTypes: [],
        emails: [],
        routes: [
          {
            id: ROUTE_ID,
            supplier_id: SUPPLIER_ID,
            name: "Pretoria to Cape Town",
            origin_location_id: ORIGIN_ID,
            destination_location_id: DESTINATION_ID,
            pickup_point: null,
            dropoff_point: null,
            direction_mode: "one_way",
            duration_days: 3,
            active: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        stationAddresses: [],
        rateCards: [],
        locations: [
          { id: ORIGIN_ID, name: "Pretoria" },
          { id: DESTINATION_ID, name: "Cape Town" },
        ],
        bedroomTypes: [],
        bedroomLayouts: [],
        bathroomTypes: [],
        suiteTypeBedroomTypes: [],
        suiteTypeBedroomLayouts: [],
        suiteTypeBathroomTypes: [],
        rateTypes: [],
        inclusionLines: [],
      })

      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") return { update: () => supplierUpdateQuery }
        if (table === "supplier_emails") return { upsert: async () => ({ error: null }) }
        if (table === "routes") {
          return {
            upsert: async (payload: unknown) => {
              routeUpsertPayloads.push(payload)
              return { error: null }
            },
          }
        }
        if (table === "vehicle_rental_route_details") {
          return { delete: () => ({ in: async () => ({ error: null }) }) }
        }
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        throw new Error(`Unexpected table ${table}`)
      })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Rovos Rail",
            // A hotel's "routes" are meal plans and its editor has no location fields, so the
            // client sends none back. Nulling them would strand the supplier: switching to Train
            // again is refused because train routes require both endpoints.
            kind: "hotel_property",
            email: "ops@example.com",
            phone: "",
            website: "",
            location: "Pretoria",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [],
            routes: [
              {
                id: ROUTE_ID,
                name: "Pretoria to Cape Town",
                directionMode: "one_way",
                active: true,
                rateCards: [],
              },
            ],
            stationAddresses: [],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      expect(routeUpsertPayloads[0]).toEqual([
        expect.objectContaining({
          id: ROUTE_ID,
          origin_location_id: ORIGIN_ID,
          destination_location_id: DESTINATION_ID,
        }),
      ])
    })
  })

  describe("route departure/arrival times", () => {
    const ORIGIN_ID = "00000000-0000-4000-8000-0000000000e1"
    const DESTINATION_ID = "00000000-0000-4000-8000-0000000000e2"
    const ROUTE_ID = "00000000-0000-4000-8000-0000000000e3"

    /** Runs a train-operator PATCH and returns the payload the routes upsert received. */
    async function patchTrainRoute(route: Record<string, unknown>) {
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

      const routeUpsertPayloads: Array<unknown> = []

      mockAuth()
      helperMocks.checkDeletionDependencies.mockResolvedValue([])
      helperMocks.deleteInChunks.mockResolvedValue({ error: null })
      helperMocks.loadSupplierDetail.mockResolvedValue({
        supplier: { ...supplierRow, kind: "train_operator" },
        suiteTypes: [],
        emails: [],
        routes: [],
        stationAddresses: [],
        rateCards: [],
        locations: [
          { id: ORIGIN_ID, name: "Pretoria" },
          { id: DESTINATION_ID, name: "Cape Town" },
        ],
        bedroomTypes: [],
        bedroomLayouts: [],
        bathroomTypes: [],
        suiteTypeBedroomTypes: [],
        suiteTypeBedroomLayouts: [],
        suiteTypeBathroomTypes: [],
        rateTypes: [],
        inclusionLines: [],
      })

      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") return { update: () => supplierUpdateQuery }
        if (table === "supplier_emails") return { upsert: async () => ({ error: null }) }
        if (table === "routes") {
          return {
            upsert: async (payload: unknown) => {
              routeUpsertPayloads.push(payload)
              return { error: null }
            },
          }
        }
        if (table === "vehicle_rental_route_details") {
          return { delete: () => ({ in: async () => ({ error: null }) }) }
        }
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        return { upsert: async () => ({ error: null }) }
      })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Rovos Rail",
            kind: "train_operator",
            email: "ops@example.com",
            phone: "",
            website: "",
            location: "Pretoria",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [],
            routes: [
              {
                id: ROUTE_ID,
                name: "Pretoria ↔ Cape Town",
                originLocationId: ORIGIN_ID,
                destinationLocationId: DESTINATION_ID,
                active: true,
                rateCards: [],
                ...route,
              },
            ],
            stationAddresses: [],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      return { response, routeUpsertPayloads }
    }

    it("persists both legs' times on a two-way route", async () => {
      const { response, routeUpsertPayloads } = await patchTrainRoute({
        directionMode: "round_trip",
        departureTime: "08:30",
        arrivalTime: "17:45",
        returnDepartureTime: "10:15",
        returnArrivalTime: "19:00",
      })

      expect(response.status).toBe(200)
      expect(routeUpsertPayloads[0]).toEqual([
        expect.objectContaining({
          id: ROUTE_ID,
          departure_time: "08:30",
          arrival_time: "17:45",
          return_departure_time: "10:15",
          return_arrival_time: "19:00",
        }),
      ])
    })

    it("clears the return times on a one-way route, so a stale pair can never resurface", async () => {
      const { response, routeUpsertPayloads } = await patchTrainRoute({
        directionMode: "one_way",
        departureTime: "08:30",
        arrivalTime: "17:45",
        returnDepartureTime: "10:15",
        returnArrivalTime: "19:00",
      })

      expect(response.status).toBe(200)
      expect(routeUpsertPayloads[0]).toEqual([
        expect.objectContaining({
          departure_time: "08:30",
          arrival_time: "17:45",
          return_departure_time: null,
          return_arrival_time: null,
        }),
      ])
    })

    it("stores no times for a kind whose routes have no schedule", async () => {
      mockAuth()
      helperMocks.checkDeletionDependencies.mockResolvedValue([])
      helperMocks.deleteInChunks.mockResolvedValue({ error: null })

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

      const routeUpsertPayloads: Array<unknown> = []

      helperMocks.loadSupplierDetail.mockResolvedValue({
        supplier: { ...supplierRow, kind: "hotel_property" },
        suiteTypes: [],
        emails: [],
        routes: [],
        stationAddresses: [],
        rateCards: [],
        locations: [],
        bedroomTypes: [],
        bedroomLayouts: [],
        bathroomTypes: [],
        suiteTypeBedroomTypes: [],
        suiteTypeBedroomLayouts: [],
        suiteTypeBathroomTypes: [],
        rateTypes: [],
        inclusionLines: [],
      })

      helperMocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === "profiles") return profileQuery("manager")
        if (table === "suppliers") return { update: () => supplierUpdateQuery }
        if (table === "routes") {
          return {
            upsert: async (payload: unknown) => {
              routeUpsertPayloads.push(payload)
              return { error: null }
            },
          }
        }
        if (table === "vehicle_rental_route_details") {
          return { delete: () => ({ in: async () => ({ error: null }) }) }
        }
        if (table === "supplier_rate_adjustments") {
          return { delete: () => ({ eq: async () => ({ error: null }) }) }
        }
        return { upsert: async () => ({ error: null }) }
      })

      const response = await PATCH(
        new Request("http://localhost/api/suppliers/test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "The Silo Hotel",
            kind: "hotel_property",
            email: "ops@example.com",
            phone: "",
            website: "",
            location: "Cape Town",
            notes: "",
            singleSupplementPct: 0,
            active: true,
            emails: [],
            suiteTypes: [],
            routes: [
              {
                id: ROUTE_ID,
                name: "Bed & Breakfast",
                directionMode: "one_way",
                active: true,
                rateCards: [],
                // A hotel editor never sends these; a hand-rolled request still must not set them.
                departureTime: "08:30",
                arrivalTime: "17:45",
              },
            ],
            stationAddresses: [],
            expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
          }),
        }),
        { params: Promise.resolve({ slug: "test" }) },
      )

      expect(response.status).toBe(200)
      expect(routeUpsertPayloads[0]).toEqual([
        expect.objectContaining({ departure_time: null, arrival_time: null }),
      ])
    })
  })
})
