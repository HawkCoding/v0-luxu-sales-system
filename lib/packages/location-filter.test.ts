import { describe, expect, it } from "vitest"
import type { Location, Supplier } from "@/lib/types"
import {
  getDestinationLocationIds,
  getDestinationNames,
  supplierMatchesDestination,
} from "@/lib/packages/location-filter"

function location(id: string, name: string, parentLocationId: string | null = null): Location {
  return {
    id,
    name,
    country: "South Africa",
    parentLocationId,
    regionCode: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  }
}

function supplier(
  partial: Pick<Supplier, "locationId" | "locationAreaId">,
): Pick<Supplier, "locationId" | "locationAreaId"> {
  return partial
}

const capeTown = location("ct", "Cape Town")
const waterfront = location("ct-wf", "Waterfront", "ct")
const seaPoint = location("ct-sp", "Sea Point", "ct")
const pretoria = location("pta", "Pretoria")
const locations = [capeTown, waterfront, seaPoint, pretoria]

describe("getDestinationLocationIds", () => {
  it("collects destinations only from train-operator legs", () => {
    const legs = [
      {
        supplierKind: "train_operator" as const,
        routes: [
          { destinationLocationId: "ct" },
          { destinationLocationId: "pta" },
          { destinationLocationId: null },
        ],
      },
      {
        supplierKind: "hotel_property" as const,
        routes: [{ destinationLocationId: "should-ignore" }],
      },
    ]
    expect(getDestinationLocationIds(legs).sort()).toEqual(["ct", "pta"])
  })

  it("returns empty when there are no train legs", () => {
    const legs = [{ supplierKind: "hotel_property" as const, routes: [{ destinationLocationId: "ct" }] }]
    expect(getDestinationLocationIds(legs)).toEqual([])
  })
})

describe("supplierMatchesDestination", () => {
  it("matches a city-tagged supplier to the destination city", () => {
    expect(supplierMatchesDestination(supplier({ locationId: "ct", locationAreaId: null }), ["ct"], locations)).toBe(true)
  })

  it("matches a sub-area supplier to the parent destination city", () => {
    expect(
      supplierMatchesDestination(supplier({ locationId: "ct", locationAreaId: "ct-wf" }), ["ct"], locations),
    ).toBe(true)
  })

  it("matches a city supplier when the destination is a sub-area", () => {
    expect(
      supplierMatchesDestination(supplier({ locationId: "ct", locationAreaId: null }), ["ct-wf"], locations),
    ).toBe(true)
  })

  it("does not match a supplier in a different city", () => {
    expect(supplierMatchesDestination(supplier({ locationId: "pta", locationAreaId: null }), ["ct"], locations)).toBe(
      false,
    )
  })

  it("does not match a supplier with no location tag", () => {
    expect(supplierMatchesDestination(supplier({ locationId: null, locationAreaId: null }), ["ct"], locations)).toBe(
      false,
    )
  })

  it("matches everything when there is no destination (no filter)", () => {
    expect(supplierMatchesDestination(supplier({ locationId: null, locationAreaId: null }), [], locations)).toBe(true)
  })
})

describe("getDestinationNames", () => {
  it("resolves IDs to names and drops unknowns", () => {
    expect(getDestinationNames(["ct", "missing", "pta"], locations)).toEqual(["Cape Town", "Pretoria"])
  })
})
