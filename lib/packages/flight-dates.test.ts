import { describe, expect, it } from "vitest"
import type { ApplyLegState } from "@/lib/packages/apply-dialog-state"
import type { PackageDetail, PackageLeg, ServiceDateAnchor, SupplierKind } from "@/lib/types"
import { resolveTripEdgeDates } from "@/lib/packages/flight-dates"

function leg(
  id: string,
  supplierKind: SupplierKind,
  sortOrder: number,
  overrides: Partial<PackageLeg> = {},
): PackageLeg {
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
    ...overrides,
  }
}

function detail(legs: PackageLeg[]): PackageDetail {
  return {
    id: "pkg",
    name: "Test Package",
    slug: "test-package",
    description: null,
    durationNights: null,
    singleSupplementPct: 0,
    fixedPricePerPerson: null,
    currency: "ZAR",
    active: true,
    legs,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  }
}

function suiteState(
  legId: string,
  supplierKind: SupplierKind,
  overrides: Partial<ApplyLegState & { kind: "suite" }> = {},
): ApplyLegState {
  return {
    kind: "suite",
    legId,
    supplierKind,
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: null,
    nights: null,
    departureTime: null,
    arrivalDate: null,
    arrivalTime: null,
    flightNumber: null,
    departureAirportCode: null,
    arrivalAirportCode: null,
    handLuggageKg: null,
    checkedLuggageKg: null,
    dateAnchor: null,
    notes: null,
    luggageStorageAvailable: false,
    accommodationPricingBasis: "per_person",
    rateTypeId: null,
    priceCurrency: "ZAR",
    units: [],
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
    ...overrides,
  } as ApplyLegState
}

function hotelState(legId: string, dateAnchor: ServiceDateAnchor, nights: number): ApplyLegState {
  return suiteState(legId, "hotel_property", { dateAnchor, nights })
}

describe("resolveTripEdgeDates", () => {
  // The QA-P2 (Rovos Rail) scenario, laid out exactly as it was built: primary rail leg departing
  // 15 Nov on a 4-day route (arrival 18 Nov), a pre-stay hotel checking in 2 nights before
  // departure, and a flight above both of them in the list.
  const primaryRoute = {
    id: "route-1",
    supplierId: "supplier-rail",
    name: "Cape Town Journey",
    active: true,
    createdAt: "",
    updatedAt: "",
    durationDays: 4,
  } as PackageLeg["routes"][number]
  const flight = leg("flight", "airline", 0)
  const rail = leg("rail", "train_operator", 1, { supplierId: "supplier-rail", routes: [primaryRoute] })
  const preHotel = leg("pre-hotel", "hotel_property", 2)
  const legs = [flight, rail, preHotel]

  it("QA-P2: pre-flight lands the day the pre-stay hotel checks in, not the primary's own departure day", () => {
    const states = [
      suiteState("flight", "airline", { dateAnchor: "pre" }),
      suiteState("rail", "train_operator", { serviceDate: "2026-11-15", routeId: "route-1" }),
      hotelState("pre-hotel", "pre", 2),
    ]

    const edge = resolveTripEdgeDates(detail(legs), states, "supplier-rail")

    // 15 Nov minus 2 nights = 13 Nov -- not 15 Nov, which is what the old position-based resolver
    // produced (F-P2-4).
    expect(edge.preDate).toBe("2026-11-13")
    expect(edge.primaryLeg?.id).toBe("rail")
  })

  it("QA-P2: post-flight/transfer edge is the primary's own arrival when there's no post-stay", () => {
    const states = [
      suiteState("flight", "airline", { dateAnchor: "post" }),
      suiteState("rail", "train_operator", { serviceDate: "2026-11-15", routeId: "route-1" }),
      hotelState("pre-hotel", "pre", 2),
    ]

    const edge = resolveTripEdgeDates(detail(legs), states, "supplier-rail")

    // 4-day route departing the 15th arrives the 18th (departure day counts as day 1).
    expect(edge.postDate).toBe("2026-11-18")
  })

  it("pre with no pre-stay hotel falls back to the primary leg's own departure day", () => {
    const states = [
      suiteState("flight", "airline", { dateAnchor: "pre" }),
      suiteState("rail", "train_operator", { serviceDate: "2026-11-15", routeId: "route-1" }),
    ]

    const edge = resolveTripEdgeDates(detail([flight, rail]), states, "supplier-rail")

    expect(edge.preDate).toBe("2026-11-15")
  })

  it("post with a post-stay resolves to the last post-stay's check-out, laid end to end", () => {
    const postHotel1 = leg("post-hotel-1", "hotel_property", 2)
    const postHotel2 = leg("post-hotel-2", "hotel_property", 3)
    const states = [
      suiteState("rail", "train_operator", { serviceDate: "2026-11-15", routeId: "route-1" }),
      hotelState("post-hotel-1", "post", 1),
      hotelState("post-hotel-2", "post", 2),
    ]

    const edge = resolveTripEdgeDates(detail([rail, postHotel1, postHotel2]), states, "supplier-rail")

    // Arrival 18 Nov -> post-hotel-1 checks in the 18th, out the 19th -> post-hotel-2 checks in the
    // 19th, out the 21st. The trip's end is the last stay's check-out.
    expect(edge.postDate).toBe("2026-11-21")
  })

  it("resolves off a tour_operator primary with no train leg anywhere in the package", () => {
    // A tour's route carries no duration_days (routeHasDuration is false for tour_operator) -- its
    // span is its own nights, exactly like a hotel's (F-P3-4, legStatesOwnSpan).
    const tourRoute = {
      id: "route-tour",
      supplierId: "supplier-tour",
      name: "Safari",
      active: true,
      createdAt: "",
      updatedAt: "",
      durationDays: null,
    } as PackageLeg["routes"][number]
    const tour = leg("tour", "tour_operator", 0, { supplierId: "supplier-tour", routes: [tourRoute] })
    const preStay = leg("pre-stay", "hotel_property", 1)
    const flightLeg = leg("flight", "airline", 2)

    const states = [
      suiteState("tour", "tour_operator", { serviceDate: "2026-06-01", routeId: "route-tour", nights: 2 }),
      hotelState("pre-stay", "pre", 1),
      suiteState("flight", "airline", { dateAnchor: "pre" }),
    ]

    const edge = resolveTripEdgeDates(detail([tour, preStay, flightLeg]), states, "supplier-tour")

    expect(edge.primaryLeg?.supplierKind).toBe("tour_operator")
    expect(edge.preDate).toBe("2026-05-31")
    // A 2-night tour from 1 June arrives 3 June -- confirms the arithmetic isn't train-specific.
    expect(edge.postDate).toBe("2026-06-03")
  })

  it("list order is irrelevant -- moving the flight below the hotel doesn't change the edges", () => {
    const reordered = [
      leg("rail", "train_operator", 0, { supplierId: "supplier-rail", routes: [primaryRoute] }),
      leg("pre-hotel", "hotel_property", 1),
      leg("flight", "airline", 2),
    ]
    const states = [
      suiteState("rail", "train_operator", { serviceDate: "2026-11-15", routeId: "route-1" }),
      hotelState("pre-hotel", "pre", 2),
      suiteState("flight", "airline", { dateAnchor: "pre" }),
    ]

    const edge = resolveTripEdgeDates(detail(reordered), states, "supplier-rail")

    expect(edge.preDate).toBe("2026-11-13")
  })

  it("returns nulls when the primary leg has no service date yet", () => {
    const states = [
      suiteState("flight", "airline", { dateAnchor: "pre" }),
      suiteState("rail", "train_operator", { routeId: "route-1" }),
    ]

    const edge = resolveTripEdgeDates(detail([flight, rail]), states, "supplier-rail")

    expect(edge.preDate).toBeNull()
    expect(edge.postDate).toBeNull()
    // The primary leg itself is still identified even though it isn't dated yet.
    expect(edge.primaryLeg?.id).toBe("rail")
  })

  it("returns an all-null result when no primary leg can be identified at all", () => {
    const edge = resolveTripEdgeDates(detail([flight]), [suiteState("flight", "airline")], "supplier-unknown")

    expect(edge).toEqual({ preDate: null, postDate: null, primaryLeg: null })
  })
})
