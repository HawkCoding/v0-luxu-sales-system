import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PackageDetail } from "@/lib/types"

const helperMocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadPackageDetail: vi.fn(),
}))

vi.mock("@/lib/api/auth", () => ({
  requireRole: helperMocks.requireRole,
  requireUser: vi.fn(),
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
const VEHICLE_RENTAL_LEG_ID = "66666666-6666-4666-8666-666666666665"
const TRAIN_ROUTE_ID = "77777777-7777-4777-8777-777777777777"
const HOTEL_MEAL_PLAN_ID = "88888888-8888-4888-8888-888888888888"
const TRANSFER_ROUTE_ID = "99999999-9999-4999-8999-999999999999"
const RENTAL_ROUTE_ID = "99999999-9999-4999-8999-999999999998"
const TRAIN_SUITE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const HOTEL_ROOM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const TRANSFER_VEHICLE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const RATE_TYPE_DEFAULT_ID = "00000000-0000-4000-8000-000000000099"
const RATE_TYPE_RESIDENT_ID = "00000000-0000-4000-8000-000000000088"

function createUnauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function makeRateCard(
  routeId: string,
  suiteTypeId: string,
  pricePerPerson: number,
  rateTypeId: string = RATE_TYPE_DEFAULT_ID,
) {
  return {
    id: crypto.randomUUID(),
    routeId,
    suiteTypeId,
    rateTypeId,
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
        supplierDescription: null,
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
        rateCards: [
          makeRateCard(TRAIN_ROUTE_ID, TRAIN_SUITE_ID, 1000, RATE_TYPE_DEFAULT_ID),
          makeRateCard(TRAIN_ROUTE_ID, TRAIN_SUITE_ID, 800, RATE_TYPE_RESIDENT_ID),
        ],
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
        supplierDescription: null,
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
        supplierDescription: null,
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
            pickupPoint: "Airport",
            dropoffPoint: "Hotel",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [
          makeRateCard(TRANSFER_ROUTE_ID, TRANSFER_VEHICLE_ID, 300),
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
      {
        id: VEHICLE_RENTAL_LEG_ID,
        packageId: PACKAGE_ID,
        supplierId: "34343434-3434-4434-8434-343434343435",
        supplierName: "Vehicle Rentals",
        supplierDescription: null,
        supplierKind: "vehicle_rental",
        label: "Vehicle Rentals",
        sortOrder: 3,
        routes: [
          {
            id: RENTAL_ROUTE_ID,
            supplierId: "34343434-3434-4434-8434-343434343435",
            name: "Three day vehicle rental",
            originLocationId: null,
            destinationLocationId: null,
            pickupPoint: "Cape Town Airport",
            dropoffPoint: "Cape Town Airport",
            vehicleRentalDetails: {
              routeId: RENTAL_ROUTE_ID,
              includedKmPerDay: null,
              extraKmPrice: null,
              securityDeposit: null,
              oneWayFee: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [
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
    package_leg_id?: string | null
    pickup_point: string
    dropoff_point: string
    pickup_at: string | null
    rental_details?: { return_at: string | null } | null
  }> = [],
  bookingOverrides: Partial<{
    no_of_adults: number
    no_of_children: number
    no_of_suites: number
    child_ages: number[]
    departure_date: string
  }> = {},
  vocabRows: {
    bedroomTypes?: Array<{ id: string; name: string }>
    bedroomLayouts?: Array<{ id: string; name: string }>
    bathroomTypes?: Array<{ id: string; name: string }>
  } = {},
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

      if (
        table === "suite_type_bedroom_types" ||
        table === "suite_type_bedroom_layouts" ||
        table === "suite_type_bathroom_types"
      ) {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "bedroom_types") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: vocabRows.bedroomTypes ?? [], error: null })) })) }
      }
      if (table === "bedroom_layouts") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: vocabRows.bedroomLayouts ?? [], error: null })) })) }
      }
      if (table === "bathroom_types") {
        return { select: vi.fn(() => ({ in: vi.fn(async () => ({ data: vocabRows.bathroomTypes ?? [], error: null })) })) }
      }

      if (table === "app_settings") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "suppliers") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "routes") {
        return {
          select: vi.fn(() => ({
            in: vi.fn(async () => ({ data: [], error: null })),
          })),
        }
      }

      if (table === "rate_types") {
        return {
          select: vi.fn(() => ({
            is: vi.fn(async () => ({
              data: [
                { id: RATE_TYPE_DEFAULT_ID, code: "RAC", name: "Rack Rate", is_default: true },
                { id: RATE_TYPE_RESIDENT_ID, code: "RESIDENT", name: "Resident Rate", is_default: false },
              ],
              error: null,
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
                ...bookingOverrides,
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
    helperMocks.requireRole.mockReset()
    helperMocks.loadPackageDetail.mockReset()
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      value: {
        supabase: createSupabaseMock(),
        user: { id: "abababab-abab-4aba-8aba-abababababab", email: "u@example.com" },
        profile: {
          clearanceLevel: "consultant",
          actorName: "Jane Doe",
          name: "Jane",
          surname: "Doe",
          email: "u@example.com",
        },
      },
    })
    helperMocks.loadPackageDetail.mockResolvedValue({ detail: buildDetail() })
  })

  it("returns 401 when unauthenticated", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: false,
      response: createUnauthorizedResponse(),
    })

    const response = await postApply({})

    expect(response.status).toBe(401)
  })

  it("returns 403 when role is not allowed", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    })

    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [],
    })

    expect(response.status).toBe(403)
  })

  it("prices a train-only selection without optional hotel or transfer lines", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
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

  it("defaults hotel to 1 room × 1 night when no rooms/nights are given", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: true, routeId: HOTEL_MEAL_PLAN_ID, units: [{ suiteTypeId: HOTEL_ROOM_ID }] },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual(
      expect.objectContaining({
        description: "Harbour Hotel - Sea View Room - Full Board — 1 night",
        qty: 1,
        unitPrice: 500,
        total: 500,
        pricingSnapshot: expect.objectContaining({ unit: "per room per night" }),
      }),
    )
  })

  it("prices hotel with N independent rooms as N line items (qty = nights per room)", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        {
          legId: HOTEL_LEG_ID,
          selected: true,
          routeId: HOTEL_MEAL_PLAN_ID,
          units: [{ suiteTypeId: HOTEL_ROOM_ID }, { suiteTypeId: HOTEL_ROOM_ID }],
          nights: 7,
        },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    const hotelLines = payload.lineItems.filter((item: { description: string }) =>
      item.description.startsWith("Harbour Hotel"),
    )
    expect(hotelLines).toHaveLength(2)
    for (const line of hotelLines) {
      expect(line).toEqual(
        expect.objectContaining({
          description: "Harbour Hotel - Sea View Room - Full Board — 7 nights",
          qty: 7,
          unitPrice: 500,
          total: 3500,
          pricingSnapshot: expect.objectContaining({ unit: "per room per night" }),
        }),
      )
    }
  })

  it("keeps mixed train and hotel rate card prices separate", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      response: null,
      value: {
        supabase: createSupabaseMock([], {
          no_of_adults: 2,
          no_of_children: 0,
          child_ages: [],
          no_of_suites: 2,
        }),
        user: { id: "abababab-abab-4aba-8aba-abababababab" },
        profile: {
          clearanceLevel: "consultant",
          actorName: "Consultant",
        },
      },
    })

    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, routeId: TRAIN_ROUTE_ID, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 0, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: true, routeId: HOTEL_MEAL_PLAN_ID, units: [{ suiteTypeId: HOTEL_ROOM_ID }] },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toEqual([
      expect.objectContaining({
        description: "Blue Train - Deluxe Suite - Cape Town to Pretoria - Adult",
        supplierDescription: null,
        qty: 2,
        unitPrice: 1000,
        total: 2000,
      }),
      expect.objectContaining({
        description: "Harbour Hotel - Sea View Room - Full Board — 1 night",
        supplierDescription: null,
        qty: 1,
        unitPrice: 500,
        total: 500,
      }),
    ])
  })

  it("uses the chosen rate type's price when the leg is priced for it", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      rateTypeId: RATE_TYPE_RESIDENT_ID,
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, routeId: TRAIN_ROUTE_ID, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    const adultLine = payload.lineItems.find((item: { description: string }) =>
      item.description.endsWith("Adult"),
    )
    expect(adultLine.unitPrice).toBe(800)
  })

  it("falls back to the default rate type for a leg not priced at the chosen type", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      rateTypeId: RATE_TYPE_RESIDENT_ID,
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, routeId: TRAIN_ROUTE_ID, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: true, routeId: HOTEL_MEAL_PLAN_ID, units: [{ suiteTypeId: HOTEL_ROOM_ID }] },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    // Train has a Resident card (800); the hotel only has the default (500).
    const adultLine = payload.lineItems.find((item: { description: string }) =>
      item.description.endsWith("Adult"),
    )
    const hotelLine = payload.lineItems.find((item: { description: string }) =>
      item.description.startsWith("Harbour Hotel"),
    )
    expect(adultLine.unitPrice).toBe(800)
    expect(hotelLine.unitPrice).toBe(500)
  })

  it("prices deterministically using the default rate type when none is chosen", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, routeId: TRAIN_ROUTE_ID, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    const adultLine = payload.lineItems.find((item: { description: string }) =>
      item.description.endsWith("Adult"),
    )
    expect(adultLine.unitPrice).toBe(1000)
  })

  it("prices selected transfer as one flat service", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: true, routeId: TRANSFER_ROUTE_ID, suiteTypeId: TRANSFER_VEHICLE_ID },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual(
      expect.objectContaining({
        description: "Airport Transfers - Sedan - Airport to Hotel",
        supplierDescription: null,
        qty: 1,
        unitPrice: 300,
        total: 300,
        pricingSnapshot: expect.objectContaining({ unit: "per vehicle" }),
      }),
    )
  })

  it("prices selected rental by billable days from the booking transport request", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      response: null,
      value: {
        supabase: createSupabaseMock([
          {
            service_type: "rental",
            route_id: RENTAL_ROUTE_ID,
            suite_type_id: TRANSFER_VEHICLE_ID,
            package_leg_id: VEHICLE_RENTAL_LEG_ID,
            pickup_point: "Cape Town Airport",
            dropoff_point: "Cape Town Airport",
            pickup_at: "2026-06-01T10:00:00.000Z",
            rental_details: { return_at: "2026-06-03T09:00:00.000Z" },
          },
        ]),
        user: { id: "abababab-abab-4aba-8aba-abababababab" },
        profile: {
          clearanceLevel: "consultant",
          actorName: "Consultant",
        },
      },
    })

    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: VEHICLE_RENTAL_LEG_ID, selected: true, routeId: RENTAL_ROUTE_ID, suiteTypeId: TRANSFER_VEHICLE_ID },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual(
      expect.objectContaining({
        description: "Vehicle Rentals - Sedan - Three day vehicle rental - Cape Town Airport -> Cape Town Airport",
        supplierDescription: null,
        qty: 2,
        unitPrice: 1200,
        total: 2400,
        pricingSnapshot: expect.objectContaining({ unit: "per day" }),
      }),
    )
  })

  it("emits one line item per vehicle when multiple rentals share the same package leg", async () => {
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      response: null,
      value: {
        supabase: createSupabaseMock([
          {
            service_type: "rental",
            route_id: RENTAL_ROUTE_ID,
            suite_type_id: TRANSFER_VEHICLE_ID,
            package_leg_id: VEHICLE_RENTAL_LEG_ID,
            pickup_point: "Cape Town Airport",
            dropoff_point: "Cape Town Airport",
            pickup_at: "2026-06-01T10:00:00.000Z",
            rental_details: { return_at: "2026-06-03T09:00:00.000Z" },
          },
          {
            service_type: "rental",
            route_id: RENTAL_ROUTE_ID,
            suite_type_id: TRANSFER_VEHICLE_ID,
            package_leg_id: VEHICLE_RENTAL_LEG_ID,
            pickup_point: "Cape Town Airport",
            dropoff_point: "Sea Point",
            pickup_at: "2026-06-01T10:00:00.000Z",
            rental_details: { return_at: "2026-06-02T09:00:00.000Z" },
          },
        ]),
        user: { id: "abababab-abab-4aba-8aba-abababababab" },
        profile: {
          clearanceLevel: "consultant",
          actorName: "Consultant",
        },
      },
    })

    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        { legId: TRAIN_LEG_ID, selected: true, units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 2, childCount: 1, infantCount: 0 }] },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: VEHICLE_RENTAL_LEG_ID, selected: true, routeId: RENTAL_ROUTE_ID, suiteTypeId: TRANSFER_VEHICLE_ID },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    const rentalLines = payload.lineItems.filter((item: { description: string }) =>
      item.description.startsWith("Vehicle Rentals"),
    )
    expect(rentalLines).toHaveLength(2)
    expect(rentalLines).toContainEqual(
      expect.objectContaining({ description: expect.stringContaining("Cape Town Airport -> Cape Town Airport"), qty: 2 }),
    )
    expect(rentalLines).toContainEqual(
      expect.objectContaining({ description: expect.stringContaining("Cape Town Airport -> Sea Point"), qty: 1 }),
    )
  })

  it("describes a unit by its specific chosen bedroom/layout/bathroom, not every option the suite type offers", async () => {
    const BEDROOM_TYPE_ID = "dededede-dede-4ded-8ded-dededededede"
    const BATHROOM_TYPE_ID = "cececece-cece-4cec-8cec-cececececece"
    helperMocks.requireRole.mockResolvedValue({
      ok: true,
      response: null,
      value: {
        supabase: createSupabaseMock([], {}, {
          bedroomTypes: [{ id: BEDROOM_TYPE_ID, name: "Twin" }],
          bathroomTypes: [{ id: BATHROOM_TYPE_ID, name: "Ensuite shower" }],
        }),
        user: { id: "abababab-abab-4aba-8aba-abababababab" },
        profile: { clearanceLevel: "consultant", actorName: "Consultant" },
      },
    })

    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        {
          legId: TRAIN_LEG_ID,
          selected: true,
          units: [
            {
              suiteTypeId: TRAIN_SUITE_ID,
              bedroomTypeId: BEDROOM_TYPE_ID,
              bathroomTypeId: BATHROOM_TYPE_ID,
              adultCount: 2,
              childCount: 1,
              infantCount: 0,
            },
          ],
        },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lineItems).toContainEqual(
      expect.objectContaining({
        description: "Blue Train - Deluxe Suite - Cape Town to Pretoria - Adult — Twin, Ensuite shower",
      }),
    )
  })

  it("returns 400 when per-unit passenger counts don't sum to the booking's traveller totals", async () => {
    const response = await postApply({
      jobId: JOB_ID,
      quoteId: QUOTE_ID,
      travelDate: "2026-06-01",
      selections: [
        {
          legId: TRAIN_LEG_ID,
          selected: true,
          units: [{ suiteTypeId: TRAIN_SUITE_ID, adultCount: 1, childCount: 0, infantCount: 0 }],
        },
        { legId: HOTEL_LEG_ID, selected: false },
        { legId: TRANSFER_LEG_ID, selected: false },
      ],
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/must sum to the booking's traveller totals/)
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
