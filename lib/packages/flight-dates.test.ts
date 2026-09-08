import { describe, expect, it } from "vitest"
import type { PackageLeg, SupplierKind } from "@/lib/types"
import { findFlightAnchorLeg } from "@/lib/packages/flight-dates"

function leg(id: string, supplierKind: SupplierKind, sortOrder: number): PackageLeg {
  return {
    id,
    packageId: "pkg",
    supplierId: `supplier-${id}`,
    supplierName: id,
    supplierDescription: null,
    supplierKind,
    pricingMode: "rate_card",
    transferPricingBasis: "per_vehicle",
    accommodationPricingBasis: "per_person",
    baseRateTypeId: null,
    quoteRateTypeId: null,
    inheritedRateTypeName: null,
    applicableRateTypeIds: null,
    label: null,
    sortOrder,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [],
  }
}

describe("findFlightAnchorLeg", () => {
  it("anchors to the leg directly above it", () => {
    const rail = leg("rail", "train_operator", 0)
    const hotel = leg("hotel", "hotel_property", 1)
    const flight = leg("flight", "airline", 2)

    expect(findFlightAnchorLeg([rail, hotel, flight], "flight")?.id).toBe("hotel")
  })

  it("skips transfer/rental legs when walking up to find a dateable neighbour", () => {
    const rail = leg("rail", "train_operator", 0)
    const transfer = leg("transfer", "transfers", 1)
    const flight = leg("flight", "airline", 2)

    expect(findFlightAnchorLeg([rail, transfer, flight], "flight")?.id).toBe("rail")
  })

  it("treats another airline leg above it as a valid anchor -- connecting flights chain", () => {
    const flight1 = leg("flight-1", "airline", 0)
    const flight2 = leg("flight-2", "airline", 1)

    expect(findFlightAnchorLeg([flight1, flight2], "flight-2")?.id).toBe("flight-1")
  })

  it("falls back to the nearest dateable leg below when nothing above qualifies", () => {
    const flight = leg("flight", "airline", 0)
    const rail = leg("rail", "train_operator", 1)

    expect(findFlightAnchorLeg([flight, rail], "flight")?.id).toBe("rail")
  })

  it("falls back downward past a transfer sitting directly below it", () => {
    const flight = leg("flight", "airline", 0)
    const transfer = leg("transfer", "transfers", 1)
    const hotel = leg("hotel", "hotel_property", 2)

    expect(findFlightAnchorLeg([flight, transfer, hotel], "flight")?.id).toBe("hotel")
  })

  it("returns null when the flight is the only dateable leg in the package", () => {
    const flight = leg("flight", "airline", 0)
    const transfer = leg("transfer", "transfers", 1)

    expect(findFlightAnchorLeg([flight, transfer], "flight")).toBeNull()
  })

  it("list position, not id order, decides the anchor", () => {
    const flight = leg("flight", "airline", 2)
    const hotel = leg("hotel", "hotel_property", 1)
    const rail = leg("rail", "train_operator", 0)

    // Passed in id order (flight, hotel, rail) but sortOrder puts rail -> hotel -> flight.
    expect(findFlightAnchorLeg([flight, hotel, rail], "flight")?.id).toBe("hotel")
  })
})
