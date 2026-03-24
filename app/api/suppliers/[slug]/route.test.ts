import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const helperMocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  loadSupplierDetail: vi.fn(),
  queryExistingIds: vi.fn(),
  checkDeletionDependencies: vi.fn(),
  makeUuid: vi.fn(),
  supabaseFrom: vi.fn(),
}))

vi.mock("../helpers", () => ({
  allowedRoles: new Set(["admin", "manager"]),
  buildErrorResponse: (message: string, status = 400) =>
    NextResponse.json({ error: message }, { status }),
  checkDeletionDependencies: helperMocks.checkDeletionDependencies,
  loadSupplierDetail: helperMocks.loadSupplierDetail,
  makeUuid: helperMocks.makeUuid,
  normalizeNullableDate: (value: string | null) => (value && value.trim() ? value : null),
  normalizeText: (value: string) => value.trim() || null,
  queryExistingIds: helperMocks.queryExistingIds,
  requireAuthenticatedUser: helperMocks.requireAuthenticatedUser,
}))

import { PATCH } from "./route"

const USER_ID = "00000000-0000-0000-0000-000000000001"
const SUPPLIER_ID = "00000000-0000-0000-0000-000000000010"
const SUITE_TYPE_OLD = "00000000-0000-0000-0000-000000000011"
const SUITE_TYPE_NEW = "00000000-0000-0000-0000-000000000012"
const PACKAGE_OLD = "00000000-0000-0000-0000-000000000021"
const PACKAGE_NEW = "00000000-0000-0000-0000-000000000022"
const ROUTE_OLD = "00000000-0000-0000-0000-000000000031"
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
