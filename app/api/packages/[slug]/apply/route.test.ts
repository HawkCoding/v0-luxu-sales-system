import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PackageDetail } from "@/lib/types"

const helperMocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  loadPackageDetail: vi.fn(),
}))

vi.mock("../../../suppliers/helpers", () => ({
  requireAuthenticatedUser: helperMocks.requireAuthenticatedUser,
}))

vi.mock("../helpers", () => ({
  loadPackageDetail: helperMocks.loadPackageDetail,
}))

import { POST } from "./route"

const JOB_ID = "11111111-1111-4111-8111-111111111111"
const QUOTE_ID = "22222222-2222-4222-8222-222222222222"
const PACKAGE_ID = "33333333-3333-4333-8333-333333333333"
const TRAIN_LEG_ID = "44444444-4444-4444-8444-444444444444"
const HOTEL_LEG_ID = "55555555-5555-4555-8555-555555555555"
const TRANSFER_LEG_ID = "66666666-6666-4666-8666-666666666666"
const TRAIN_ROUTE_ID = "77777777-7777-4777-8777-777777777777"
const HOTEL_MEAL_PLAN_ID = "88888888-8888-4888-8888-888888888888"
const TRANSFER_ROUTE_ID = "99999999-9999-4999-8999-999999999999"
const RENTAL_ROUTE_ID = "99999999-9999-4999-8999-999999999998"
const TRAIN_SUITE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const HOTEL_ROOM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const TRANSFER_VEHICLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

function createUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function makeRateCard(routeId: string, suiteTypeId: string, pricePerPerson: number) {
  return {
    id: crypto.randomUUID(),
    routeId,
    suiteTypeId,
    pricePerPerson,
    childPrice: null,
    infantPrice: null,
    currency: "ZAR",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function buildDetail(): PackageDetail {
  return {
    id: PACKAGE_ID,
    name: "Ocean Safari",
    slug: "ocean-safari",
    description: null,
    durationNights: 2,
    singleSupplementPct: 50,
    fixedPricePerPerson: null,
    currency: "ZAR",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    legs: [
      {
        id: TRAIN_LEG_ID,
        packageId: PACKAGE_ID,
        supplierId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        supplierName: "Blue Train",
        supplierKind: "train_operator",
        label: "Blue Train",
        sortOrder: 0,
        routes: [
          {
            id: TRAIN_ROUTE_ID,
            supplierId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "Cape Town to Pretoria",
            originLocationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            destinationLocationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [makeRateCard(TRAIN_ROUTE_ID, TRAIN_SUITE_ID, 1000)],
        suiteTypes: [
          {
            id: TRAIN_SUITE_ID,
            supplierId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            name: "Deluxe Suite",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      {
        id: HOTEL_LEG_ID,
        packageId: PACKAGE_ID,
        supplierId: "12121212-1212-4212-8212-121212121212",
        supplierName: "Harbour Hotel",
        supplierKind: "hotel_property",
        label: "Harbour Hotel",
        sortOrder: 1,
        routes: [
          {
            id: HOTEL_MEAL_PLAN_ID,
            supplierId: "12121212-1212-4212-8212-121212121212",
            name: "Full Board",
            originLocationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            destinationLocationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [makeRateCard(HOTEL_MEAL_PLAN_ID, HOTEL_ROOM_ID, 500)],
        suiteTypes: [
          {
            id: HOTEL_ROOM_ID,
            supplierId: "12121212-1212-4212-8212-121212121212",
            name: "Sea View Room",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      {
        id: TRANSFER_LEG_ID,
        packageId: PACKAGE_ID,
        supplierId: "34343434-3434-4434-8434-343434343434",
        supplierName: "Airport Transfers",
        supplierKind: "transfers",
        label: "Airport Transfers",
        sortOrder: 2,
        routes: [
          {
            id: TRANSFER_ROUTE_ID,
            supplierId: "34343434-3434-4434-8434-343434343434",
            name: "Airport to Hotel",
            originLocationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            destinationLocationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            transportServiceType: "transfer",
            pickupPoint: "Airport",
            dropoffPoint: "Hotel",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: RENTAL_ROUTE_ID,
            supplierId: "34343434-3434-4434-8434-343434343434",
            name: "Three day vehicle rental",
            originLocationId: null,
            destinationLocationId: null,
            transportServiceType: "rental",
            pickupPoint: "Cape Town Airport",
            dropoffPoint: "Cape Town Airport",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [
          makeRateCard(TRANSFER_ROUTE_ID, TRANSFER_VEHICLE_ID, 300),
          makeRateCard(RENTAL_ROUTE_ID, TRANSFER_VEHICLE_ID, 1200),
        ],
        suiteTypes: [
          {
            id: TRANSFER_VEHICLE_ID,
            supplierId: "34343434-3434-4434-8434-343434343434",
            name: "Sedan",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    ],
  }
}

function createSupabaseMock(
  transportRequests: Array<{
    service_type: "transfer" | "rental"
    route_id: string | null
    suite_type_id: string | null
    pickup_point: string
    dropoff_point: string
    pickup_at: string | null
    return_at: string | null
  }> = [],
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "booking_transport_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: transportRequests, error: null })),
            })),
          })),
        }
      }

      if (table !== "bookings") throw new Error(`Unexpected table ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: {
                id: JOB_ID,
                no_of_adults: 2,
                no_of_children: 1,
                no_of_suites: 2,
                child_ages: [6],
                departure_date: "2026-06-01",
              },
              error: null,
            })),
          })),
        })),
      }
    }),
  }
}

async function postApply(body: unknown) {
  return POST(
    new Request("http://localhost/api/packages/ocean-safari/apply", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: "ocean-safari" }) },
  )
}

describe("POST /api/packages/[slug]/apply", () => {
  beforeEach(() => {
    helperMocks.requireAuthenticatedUser.mockReset()
    helperMocks.loadPackageDetail.mockReset()
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: createSupabaseMock(),
      user: { id: "abababab-abab-4aba-8aba-abababababab" },
    })
    helperMocks.loadPackageDetail.mockResolvedValue({ detail: buildDetail() })
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      error: createUnauthorizedResponse(),
    })

    const response = await postApply({})

    expect(response.status).toBe(401)
  })

  it("prices a train-only selection without optional hotel or transfer lines", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, suiteTypeId: TRAIN_SUITE_ID },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toHaveLength(2)
    expect(payload.lineItems.map((item: { description: string }) => item.description)).toEqual([
      "Blue Train - Deluxe Suite - Cape Town to Pretoria - Adult",
      "Blue Train - Deluxe Suite - Cape Town to Pretoria - Child",
    ])
  })

  it("prices selected hotel by suite count and package nights", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, suiteTypeId: TRAIN_SUITE_ID },
        { legId: HOTEL_LEG_ID, selected: true, routeId: HOTEL_MEAL_PLAN_ID, suiteTypeId: HOTEL_ROOM_ID },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual({
      description: "Harbour Hotel - Sea View Room - Full Board",
      qty: 4,
      unitPrice: 500,
      total: 2000,
    })
  })

  it("prices selected transfer as one flat service", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, suiteTypeId: TRAIN_SUITE_ID },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: true, routeId: TRANSFER_ROUTE_ID, suiteTypeId: TRANSFER_VEHICLE_ID },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual({
      description: "Airport Transfers - Sedan - Airport to Hotel",
      qty: 1,
      unitPrice: 300,
      total: 300,
    })
  })

  it("prices selected rental by billable days from the booking transport request", async () => {
    helperMocks.requireAuthenticatedUser.mockResolvedValue({
      supabase: createSupabaseMock([
        {
          service_type: "rental",
          route_id: RENTAL_ROUTE_ID,
          suite_type_id: TRANSFER_VEHICLE_ID,
          pickup_point: "Cape Town Airport",
          dropoff_point: "Cape Town Airport",
          pickup_at: "2026-06-01T10:00:00.000Z",
          return_at: "2026-06-03T09:00:00.000Z",
        },
      ]),
      user: { id: "abababab-abab-4aba-8aba-abababababab" },
    })

    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, suiteTypeId: TRAIN_SUITE_ID },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: true, routeId: RENTAL_ROUTE_ID, suiteTypeId: TRANSFER_VEHICLE_ID },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual({
      description: "Airport Transfers - Sedan - Three day vehicle rental - Cape Town Airport -> Cape Town Airport",
      qty: 2,
      unitPrice: 1200,
      total: 2400,
    })
  })

  it("returns 400 when a required train suite type is missing", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [{ legId: TRAIN_LEG_ID, selected: true }],
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/No suite type selected/)
  })
})
