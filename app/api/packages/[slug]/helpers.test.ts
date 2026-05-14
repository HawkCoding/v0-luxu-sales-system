import { describe, expect, it } from "vitest"
import { normalizePackageChildren } from "./helpers"
import type { UpsertPackageInput } from "../schemas"

const PACKAGE_ID = "11111111-1111-1111-1111-111111111111"
const SUPPLIER_ID = "22222222-2222-2222-2222-222222222222"
const EXISTING_ROUTE_ID = "33333333-3333-3333-3333-333333333333"
const NEW_ROUTE_ID = "44444444-4444-4444-4444-444444444444"
const EXISTING_RATE_ID = "55555555-5555-5555-5555-555555555555"
const NEW_RATE_ID = "66666666-6666-6666-6666-666666666666"
const SUITE_TYPE_ID = "77777777-7777-7777-7777-777777777777"
const ORIGIN_ID = "88888888-8888-8888-8888-888888888888"
const DESTINATION_ID = "99999999-9999-9999-9999-999999999999"
const LEG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

function buildInput(): UpsertPackageInput {
  return {
    name: "Test package",
    description: null,
    durationNights: 3,
    currency: "ZAR",
    singleSupplementPct: 50,
    markupPct: 0,
    fixedPricePerPerson: null,
    active: true,
    legs: [
      {
        id: LEG_ID,
        supplierId: SUPPLIER_ID,
        label: "Blue Train",
        sortOrder: 0,
        routes: [
          {
            id: EXISTING_ROUTE_ID,
            name: "Pretoria → Cape Town",
            originLocationId: ORIGIN_ID,
            destinationLocationId: DESTINATION_ID,
            active: true,
            existing: true,
          },
          {
            id: NEW_ROUTE_ID,
            name: "Cape Town → Pretoria",
            originLocationId: DESTINATION_ID,
            destinationLocationId: ORIGIN_ID,
            active: true,
            existing: false,
          },
        ],
        rateCards: [
          {
            id: EXISTING_RATE_ID,
            routeId: EXISTING_ROUTE_ID,
            suiteTypeId: SUITE_TYPE_ID,
            pricePerPerson: 12000,
            childPrice: null,
            infantPrice: null,
            currency: "ZAR",
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
            existing: true,
          },
          {
            id: NEW_RATE_ID,
            routeId: EXISTING_ROUTE_ID,
            suiteTypeId: SUITE_TYPE_ID,
            pricePerPerson: 13000,
            childPrice: null,
            infantPrice: null,
            currency: "ZAR",
            validFrom: "2027-01-01",
            validTo: "",
            existing: false,
          },
        ],
      },
    ],
  }
}

describe("normalizePackageChildren", () => {
  it("excludes existing routes from inserts but includes them in allRouteIds", () => {
    const result = normalizePackageChildren(PACKAGE_ID, buildInput())

    expect(result.routes.map((r) => r.id)).toEqual([NEW_ROUTE_ID])
    expect(result.allRouteIds).toEqual([EXISTING_ROUTE_ID, NEW_ROUTE_ID])
  })

  it("creates package route links for selected existing and new routes", () => {
    const result = normalizePackageChildren(PACKAGE_ID, buildInput())

    expect(result.routeLinks).toEqual([
      expect.objectContaining({ package_leg_id: LEG_ID, route_id: EXISTING_ROUTE_ID }),
      expect.objectContaining({ package_leg_id: LEG_ID, route_id: NEW_ROUTE_ID }),
    ])
  })

  it("excludes existing rate cards from inserts but includes them in allRateCardIds", () => {
    const result = normalizePackageChildren(PACKAGE_ID, buildInput())

    expect(result.rateCards.map((r) => r.id)).toEqual([NEW_RATE_ID])
    expect(result.allRateCardIds).toEqual([EXISTING_RATE_ID, NEW_RATE_ID])
  })

  it("allows a new rate card to reference an existing route id", () => {
    const result = normalizePackageChildren(PACKAGE_ID, buildInput())
    const newRate = result.rateCards.find((r) => r.id === NEW_RATE_ID)

    expect(newRate?.route_id).toBe(EXISTING_ROUTE_ID)
  })

  it("rejects a rate card that references an unknown route", () => {
    const input = buildInput()
    input.legs[0].rateCards[0].routeId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    expect(() => normalizePackageChildren(PACKAGE_ID, input)).toThrow(
      /must reference a route from the same leg/,
    )
  })
})
