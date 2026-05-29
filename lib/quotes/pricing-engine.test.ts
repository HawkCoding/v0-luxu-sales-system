import { describe, expect, it } from "vitest"
import type { PackageDetail } from "@/lib/types"
import {
  buildPackagePricing,
  calculateQuoteTotals,
  getValidRateCard,
  inferSingleAdultCount,
} from "@/lib/quotes/pricing-engine"

const PACKAGE_ID = "00000000-0000-4000-8000-000000000001"
const BLUE_TRAIN_LEG_ID = "00000000-0000-4000-8000-000000000002"
const ROVOS_LEG_ID = "00000000-0000-4000-8000-000000000003"
const HOTEL_LEG_ID = "00000000-0000-4000-8000-000000000004"
const TRANSFER_LEG_ID = "00000000-0000-4000-8000-000000000005"
const RENTAL_LEG_ID = "00000000-0000-4000-8000-000000000006"
const BLUE_ROUTE_ID = "00000000-0000-4000-8000-000000000011"
const ROVOS_ROUTE_ID = "00000000-0000-4000-8000-000000000012"
const HOTEL_ROUTE_ID = "00000000-0000-4000-8000-000000000013"
const TRANSFER_ROUTE_ID = "00000000-0000-4000-8000-000000000014"
const RENTAL_ROUTE_ID = "00000000-0000-4000-8000-000000000015"
const SUITE_ID = "00000000-0000-4000-8000-000000000021"
const ROVOS_SUITE_ID = "00000000-0000-4000-8000-000000000022"
const HOTEL_SUITE_ID = "00000000-0000-4000-8000-000000000023"
const VEHICLE_ID = "00000000-0000-4000-8000-000000000024"

function rateCard(
  id: string,
  routeId: string,
  suiteTypeId: string,
  pricePerPerson: number,
  childPrice: number | null = null,
  infantPrice: number | null = null,
) {
  return {
    id,
    routeId,
    suiteTypeId,
    rateTypeId: "00000000-0000-4000-8000-000000000099",
    pricePerPerson,
    childPrice,
    infantPrice,
    currency: "ZAR",
    validFrom: "2026-01-01",
    validTo: "2026-12-31" as string | null,
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function packageDetail(overrides: Partial<PackageDetail> = {}): PackageDetail {
  return {
    id: PACKAGE_ID,
    name: "Blue Train and Rovos Example",
    slug: "blue-train-rovos-example",
    description: null,
    durationNights: 2,
    singleSupplementPct: 50,
    markupPct: 10,
    fixedPricePerPerson: null,
    currency: "ZAR",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    legs: [
      {
        id: BLUE_TRAIN_LEG_ID,
        packageId: PACKAGE_ID,
        supplierId: "00000000-0000-4000-8000-000000000031",
        supplierName: "Blue Train",
        supplierDescription: null,
        supplierKind: "train_operator",
        label: "Blue Train",
        sortOrder: 0,
        routes: [
          {
            id: BLUE_ROUTE_ID,
            supplierId: "00000000-0000-4000-8000-000000000031",
            name: "Cape Town to Pretoria",
            originLocationId: null,
            destinationLocationId: null,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        suiteTypes: [
          {
            id: SUITE_ID,
            supplierId: "00000000-0000-4000-8000-000000000031",
            name: "Deluxe Suite",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [rateCard("rate-blue", BLUE_ROUTE_ID, SUITE_ID, 10000, 6000, 1000)],
      },
      {
        id: ROVOS_LEG_ID,
        packageId: PACKAGE_ID,
        supplierId: "00000000-0000-4000-8000-000000000032",
        supplierName: "Rovos Rail",
        supplierDescription: null,
        supplierKind: "train_operator",
        label: "Rovos Rail",
        sortOrder: 1,
        routes: [
          {
            id: ROVOS_ROUTE_ID,
            supplierId: "00000000-0000-4000-8000-000000000032",
            name: "Pretoria to Victoria Falls",
            originLocationId: null,
            destinationLocationId: null,
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        suiteTypes: [
          {
            id: ROVOS_SUITE_ID,
            supplierId: "00000000-0000-4000-8000-000000000032",
            name: "Pullman Suite",
            active: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        rateCards: [rateCard("rate-rovos", ROVOS_ROUTE_ID, ROVOS_SUITE_ID, 12000)],
      },
    ],
    ...overrides,
  }
}

describe("pricing engine", () => {
  it("applies adult, child, infant and package markup pricing", () => {
    const lineItems = buildPackagePricing({
      packageDetail: packageDetail({ singleSupplementPct: 0, legs: [packageDetail().legs[0]] }),
      booking: { noOfAdults: 2, noOfChildren: 2, noOfSuites: 2, childAges: [1, 8] },
      travelDate: "2026-06-01",
      selections: [
        { legId: BLUE_TRAIN_LEG_ID, routeId: BLUE_ROUTE_ID, suiteTypeId: SUITE_ID },
      ],
    })

    expect(lineItems.map((item) => [item.description, item.qty, item.unitPrice, item.total])).toEqual([
      ["Blue Train - Deluxe Suite - Cape Town to Pretoria - Adult", 2, 11000, 22000],
      ["Blue Train - Deluxe Suite - Cape Town to Pretoria - Child", 1, 6600, 6600],
      ["Blue Train - Deluxe Suite - Cape Town to Pretoria - Infant", 1, 1100, 1100],
    ])
    expect(lineItems[0].pricingSnapshot).toMatchObject({
      source: "pricing_engine",
      baseUnitPrice: 10000,
      markupPct: 10,
      passengerKind: "adult",
    })
  })

  it("adds single supplements for inferred single adult occupancy", () => {
    const lineItems = buildPackagePricing({
      packageDetail: packageDetail({ markupPct: 0, legs: [packageDetail().legs[0]] }),
      booking: { noOfAdults: 2, noOfChildren: 0, noOfSuites: 2, childAges: [] },
      travelDate: "2026-06-01",
      selections: [
        { legId: BLUE_TRAIN_LEG_ID, routeId: BLUE_ROUTE_ID, suiteTypeId: SUITE_ID },
      ],
    })

    expect(inferSingleAdultCount({ noOfAdults: 2, noOfChildren: 0, noOfSuites: 2, childAges: [] })).toBe(2)
    expect(lineItems).toContainEqual(
      expect.objectContaining({
        description: "Blue Train - Deluxe Suite - Cape Town to Pretoria - Single supplement",
        qty: 2,
        unitPrice: 5000,
        total: 10000,
      }),
    )
  })

  it("applies markup to fixed package pricing and totals", () => {
    const lineItems = buildPackagePricing({
      packageDetail: packageDetail({ fixedPricePerPerson: 20000, markupPct: 15, singleSupplementPct: 0 }),
      booking: { noOfAdults: 2, noOfChildren: 1, noOfSuites: 2, childAges: [10] },
      travelDate: "2026-06-01",
    })

    expect(lineItems).toContainEqual(
      expect.objectContaining({
        description: "Blue Train and Rovos Example - Package Total",
        qty: 3,
        unitPrice: 23000,
        total: 69000,
      }),
    )
    expect(calculateQuoteTotals(lineItems)).toEqual({ subtotal: 69000, vat: 10350, total: 79350 })
  })

  it("keeps mixed train, hotel, transfer, and rental legs deterministic", () => {
    const detail = packageDetail({
      markupPct: 0,
      singleSupplementPct: 0,
      legs: [
        packageDetail().legs[0],
        {
          id: HOTEL_LEG_ID,
          packageId: PACKAGE_ID,
          supplierId: "00000000-0000-4000-8000-000000000033",
          supplierName: "Silo Hotel",
          supplierDescription: null,
          supplierKind: "hotel_property",
          label: "Silo Hotel",
          sortOrder: 1,
          routes: [
            {
              id: HOTEL_ROUTE_ID,
              supplierId: "00000000-0000-4000-8000-000000000033",
              name: "Breakfast",
              originLocationId: null,
              destinationLocationId: null,
              active: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          suiteTypes: [
            {
              id: HOTEL_SUITE_ID,
              supplierId: "00000000-0000-4000-8000-000000000033",
              name: "Luxury Room",
              active: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          rateCards: [rateCard("rate-hotel", HOTEL_ROUTE_ID, HOTEL_SUITE_ID, 3000)],
        },
        {
          id: TRANSFER_LEG_ID,
          packageId: PACKAGE_ID,
          supplierId: "00000000-0000-4000-8000-000000000034",
          supplierName: "Airport Transfers",
          supplierDescription: null,
          supplierKind: "transfers",
          label: "Airport Transfers",
          sortOrder: 2,
          routes: [
            {
              id: TRANSFER_ROUTE_ID,
              supplierId: "00000000-0000-4000-8000-000000000034",
              name: "Airport to Station",
              originLocationId: null,
              destinationLocationId: null,
              active: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          suiteTypes: [
            {
              id: VEHICLE_ID,
              supplierId: "00000000-0000-4000-8000-000000000034",
              name: "Sedan",
              active: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          rateCards: [rateCard("rate-transfer", TRANSFER_ROUTE_ID, VEHICLE_ID, 700)],
        },
        {
          id: RENTAL_LEG_ID,
          packageId: PACKAGE_ID,
          supplierId: "00000000-0000-4000-8000-000000000035",
          supplierName: "Vehicle Rentals",
          supplierDescription: null,
          supplierKind: "vehicle_rental",
          label: "Vehicle Rentals",
          sortOrder: 3,
          routes: [
            {
              id: RENTAL_ROUTE_ID,
              supplierId: "00000000-0000-4000-8000-000000000035",
              name: "Cape Town Rental",
              originLocationId: null,
              destinationLocationId: null,
              active: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          suiteTypes: [
            {
              id: VEHICLE_ID,
              supplierId: "00000000-0000-4000-8000-000000000035",
              name: "Sedan",
              active: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          rateCards: [rateCard("rate-rental", RENTAL_ROUTE_ID, VEHICLE_ID, 900)],
        },
      ],
    })

    const lineItems = buildPackagePricing({
      packageDetail: detail,
      booking: { noOfAdults: 2, noOfChildren: 0, noOfSuites: 1, childAges: [] },
      travelDate: "2026-06-01",
      selections: [
        { legId: BLUE_TRAIN_LEG_ID, routeId: BLUE_ROUTE_ID, suiteTypeId: SUITE_ID },
        { legId: HOTEL_LEG_ID, selected: true, routeId: HOTEL_ROUTE_ID, suiteTypeId: HOTEL_SUITE_ID },
        { legId: TRANSFER_LEG_ID, selected: true, routeId: TRANSFER_ROUTE_ID, suiteTypeId: VEHICLE_ID },
        { legId: RENTAL_LEG_ID, selected: true, routeId: RENTAL_ROUTE_ID, suiteTypeId: VEHICLE_ID },
      ],
      transportRequests: [
        {
          serviceType: "rental",
          routeId: RENTAL_ROUTE_ID,
          suiteTypeId: VEHICLE_ID,
          pickupPoint: "Cape Town Airport",
          dropoffPoint: "Cape Town Airport",
          pickupAt: "2026-06-01T10:00:00.000Z",
          rentalDetails: { returnAt: "2026-06-03T09:00:00.000Z" },
        },
      ],
    })

    expect(lineItems.map((item) => [item.description, item.qty, item.total])).toEqual([
      ["Blue Train - Deluxe Suite - Cape Town to Pretoria - Adult", 2, 20000],
      ["Silo Hotel - Luxury Room - Breakfast", 2, 6000],
      ["Airport Transfers - Sedan - Airport to Station", 1, 700],
      ["Vehicle Rentals - Sedan - Cape Town Rental - Cape Town Airport -> Cape Town Airport", 2, 1800],
    ])
  })

  it("surfaces missing pricing for date gaps", () => {
    expect(() =>
      buildPackagePricing({
        packageDetail: packageDetail(),
        booking: { noOfAdults: 2, noOfChildren: 0, noOfSuites: 1, childAges: [] },
        travelDate: "2027-01-01",
        selections: [
          { legId: BLUE_TRAIN_LEG_ID, routeId: BLUE_ROUTE_ID, suiteTypeId: SUITE_ID },
          { legId: ROVOS_LEG_ID, selected: false },
        ],
      }),
    ).toThrow(/No pricing available/)
  })
})

describe("getValidRateCard — date range selection", () => {
  const ROUTE = BLUE_ROUTE_ID
  const SUITE = SUITE_ID

  function leg(rateCards: ReturnType<typeof rateCard>[]) {
    return packageDetail().legs[0] && { ...packageDetail().legs[0], rateCards }
  }

  function rc(validFrom: string, validTo: string | null) {
    return { ...rateCard("rc-1", ROUTE, SUITE, 10000), validFrom, validTo }
  }

  it("returns the rate card when travel date is inside a bounded range", () => {
    const result = getValidRateCard(leg([rc("2026-01-01", "2026-12-31")]), ROUTE, SUITE, "2026-06-15")
    expect(result).toBeDefined()
    expect(result?.validFrom).toBe("2026-01-01")
  })

  it("returns the rate card when travel date is on an open-ended range (validTo is null)", () => {
    const result = getValidRateCard(leg([rc("2026-01-01", null)]), ROUTE, SUITE, "2027-06-15")
    expect(result).toBeDefined()
  })

  it("returns undefined when travel date is before validFrom", () => {
    const result = getValidRateCard(leg([rc("2026-01-01", "2026-12-31")]), ROUTE, SUITE, "2025-12-31")
    expect(result).toBeUndefined()
  })

  it("returns undefined when travel date is after validTo on a closed range", () => {
    const result = getValidRateCard(leg([rc("2026-01-01", "2026-12-31")]), ROUTE, SUITE, "2027-01-01")
    expect(result).toBeUndefined()
  })
})
