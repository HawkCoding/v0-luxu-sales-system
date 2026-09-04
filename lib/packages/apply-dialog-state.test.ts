import { describe, expect, it } from "vitest"
import type { BookingTransportRequest, PackageDetail, PackageLeg, SupplierKind } from "@/lib/types"
import { joinLocalDateTime, splitLocalDateTime } from "@/lib/date-time-field"
import {
  applyAnchoredAirlineDates,
  applyAnchoredDates,
  applyAnchoredHotelDates,
  applyAnchoredTransferDates,
  buildDefaultLegStates,
  createDraftTransportRequest,
  getTransferAnchorContext,
  hydrateFromSaved,
  toApplySelections,
  toHotelAnchorContext,
  toPackageSelectionsPatch,
  toTransferAnchorContext,
  toTransportRequestsPut,
  validateConfigureState,
  type ApplyLegState,
  type SavedPackageState,
  type SuiteLegState,
  type TransportLegState,
} from "@/lib/packages/apply-dialog-state"

function leg(partial: Partial<PackageLeg> & { id: string; supplierKind: SupplierKind }): PackageLeg {
  return {
    packageId: "pkg-1",
    supplierId: `supplier-${partial.id}`,
    supplierName: `Supplier ${partial.id}`,
    supplierDescription: null,
    pricingMode: "rate_card",
    transferPricingBasis: "per_vehicle",
    accommodationPricingBasis: "per_person",
    baseRateTypeId: null,
    quoteRateTypeId: null,
    inheritedRateTypeName: null,
    applicableRateTypeIds: null,
    label: null,
    sortOrder: 0,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [],
    ...partial,
  }
}

function detail(legs: PackageLeg[]): PackageDetail {
  return {
    id: "pkg-1",
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

const trainLeg = leg({
  id: "leg-train",
  supplierKind: "train_operator",
  sortOrder: 1,
  routes: [
    {
      id: "route-1",
      supplierId: "supplier-leg-train",
      name: "Cape Town ↔ Pretoria",
      originLocationId: "loc-cpt",
      destinationLocationId: "loc-pta",
      originLocationName: "Cape Town",
      destinationLocationName: "Pretoria",
      directionMode: "round_trip",
      active: true,
      createdAt: "",
      updatedAt: "",
    },
  ] as PackageLeg["routes"],
  suiteTypes: [
    { id: "suite-1", supplierId: "supplier-leg-train", name: "Deluxe", active: true, createdAt: "", updatedAt: "" },
  ] as PackageLeg["suiteTypes"],
  rateCards: [
    {
      id: "rate-train-1",
      routeId: "route-1",
      suiteTypeId: "suite-1",
      rateTypeId: "rate-type-default",
      pricePerPerson: 1000,
      childPrice: null,
      infantPrice: null,
      currency: "ZAR",
      validFrom: "2026-01-01",
      validTo: null,
      createdAt: "",
    },
  ] as PackageLeg["rateCards"],
})

const hotelLeg = leg({
  id: "leg-hotel",
  supplierKind: "hotel_property",
  sortOrder: 2,
  routes: [
    { id: "route-bb", supplierId: "supplier-leg-hotel", name: "B&B", active: true, createdAt: "", updatedAt: "" },
    { id: "route-fb", supplierId: "supplier-leg-hotel", name: "Full board", active: true, createdAt: "", updatedAt: "" },
  ] as PackageLeg["routes"],
  suiteTypes: [
    { id: "room-1", supplierId: "supplier-leg-hotel", name: "Standard", active: true, createdAt: "", updatedAt: "" },
  ] as PackageLeg["suiteTypes"],
  rateCards: [
    {
      id: "rate-hotel-1",
      routeId: "route-bb",
      suiteTypeId: "room-1",
      rateTypeId: "rate-type-default",
      pricePerPerson: 500,
      childPrice: null,
      infantPrice: null,
      currency: "ZAR",
      validFrom: "2026-01-01",
      validTo: null,
      createdAt: "",
    },
  ] as PackageLeg["rateCards"],
})

const transferLeg = leg({
  id: "leg-transfer",
  supplierKind: "transfers",
  sortOrder: 3,
  routes: [
    {
      id: "route-transfer-1",
      supplierId: "supplier-leg-transfer",
      name: "Airport - Hotel",
      active: true,
      pickupPoint: "Cape Town Airport",
      dropoffPoint: "V&A Waterfront",
      createdAt: "",
      updatedAt: "",
    },
  ] as PackageLeg["routes"],
  suiteTypes: [
    { id: "vehicle-1", supplierId: "supplier-leg-transfer", name: "Sedan", active: true, createdAt: "", updatedAt: "" },
  ] as PackageLeg["suiteTypes"],
})

const pkg = detail([hotelLeg, trainLeg, transferLeg])

const totals = { "supplier-leg-train": { adultCount: 2, childCount: 1, infantCount: 0 } }

function suiteState(states: ReturnType<typeof buildDefaultLegStates>, legId: string): SuiteLegState {
  const state = states.find((s) => s.legId === legId)
  if (!state || state.kind !== "suite") throw new Error(`expected suite leg state for ${legId}`)
  return state
}

function transportState(states: ReturnType<typeof buildDefaultLegStates>, legId: string): TransportLegState {
  const state = states.find((s) => s.legId === legId)
  if (!state || state.kind !== "transport") throw new Error(`expected transport leg state for ${legId}`)
  return state
}

describe("buildDefaultLegStates", () => {
  it("orders legs by sortOrder and picks state kind by supplier kind", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01" })
    expect(states.map((s) => s.legId)).toEqual(["leg-train", "leg-hotel", "leg-transfer"])
    expect(states.map((s) => s.kind)).toEqual(["suite", "suite", "transport"])
  })

  it("pre-selects the only route and seeds one draft unit / transport request", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01" })
    const train = suiteState(states, "leg-train")
    expect(train.routeId).toBe("route-1")
    expect(train.reversed).toBe(false)
    expect(train.units).toHaveLength(1)
    expect(train.serviceDate).toBe("2026-09-01")

    const hotel = suiteState(states, "leg-hotel")
    expect(hotel.routeId).toBeNull() // two routes: user must choose
    expect(hotel.nights).toBe(1)

    const transfer = transportState(states, "leg-transfer")
    expect(transfer.requests).toHaveLength(1)
    expect(transfer.requests[0].serviceType).toBe("transfer")
  })

  it("pre-fills pickup/drop-off from a leg's single route", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01" })
    const transfer = transportState(states, "leg-transfer")
    expect(transfer.routeId).toBe("route-transfer-1")
    expect(transfer.requests[0].pickupPoint).toBe("Cape Town Airport")
    expect(transfer.requests[0].dropoffPoint).toBe("V&A Waterfront")
  })

  it("seeds a new airline leg's From/To from its one route's code-pair name, times still null", () => {
    const airlineLeg = leg({
      id: "leg-airline",
      supplierKind: "airline",
      sortOrder: 4,
      pricingMode: "manual",
      routes: [
        {
          id: "route-airline-1",
          supplierId: "supplier-leg-airline",
          name: "CPT > ORT",
          originLocationId: "loc-cpt",
          destinationLocationId: "loc-ort",
          directionMode: "round_trip",
          active: true,
          createdAt: "",
          updatedAt: "",
        },
      ] as PackageLeg["routes"],
    })

    const states = buildDefaultLegStates(detail([...pkg.legs, airlineLeg]), {
      tripStartDate: "2026-09-01",
    })
    const airline = suiteState(states, "leg-airline")

    expect(airline.routeId).toBe("route-airline-1")
    expect(airline.departureAirportCode).toBe("CPT")
    expect(airline.arrivalAirportCode).toBe("ORT")
    expect(airline.departureTime).toBeNull()
    expect(airline.arrivalDate).toBeNull()
    expect(airline.arrivalTime).toBeNull()
  })

  it("leaves an airline leg's From/To null when its route name isn't a code pair", () => {
    const airlineLeg = leg({
      id: "leg-airline-prose",
      supplierKind: "airline",
      sortOrder: 4,
      pricingMode: "manual",
      routes: [
        {
          id: "route-airline-prose",
          supplierId: "supplier-leg-airline-prose",
          name: "Cape Town to Johannesburg",
          originLocationId: "loc-cpt",
          destinationLocationId: "loc-ort",
          directionMode: "round_trip",
          active: true,
          createdAt: "",
          updatedAt: "",
        },
      ] as PackageLeg["routes"],
    })

    const states = buildDefaultLegStates(detail([...pkg.legs, airlineLeg]), {
      tripStartDate: "2026-09-01",
    })
    const airline = suiteState(states, "leg-airline-prose")

    expect(airline.departureAirportCode).toBeNull()
    expect(airline.arrivalAirportCode).toBeNull()
  })

  it("createDraftTransportRequest pre-fills from an explicitly passed route on multi-route legs", () => {
    const multiRouteLeg = leg({
      id: "leg-multi",
      supplierKind: "transfers",
      sortOrder: 5,
      routes: [
        { id: "route-a", supplierId: "supplier-leg-multi", name: "A", active: true, pickupPoint: "Point A", dropoffPoint: "Point B", createdAt: "", updatedAt: "" },
        { id: "route-b", supplierId: "supplier-leg-multi", name: "B", active: true, pickupPoint: "Point C", dropoffPoint: "Point D", createdAt: "", updatedAt: "" },
      ] as PackageLeg["routes"],
    })

    const request = createDraftTransportRequest(multiRouteLeg, "route-b")
    expect(request.pickupPoint).toBe("Point C")
    expect(request.dropoffPoint).toBe("Point D")
  })

  it("createDraftTransportRequest defaults to the supplier's per_vehicle basis with no pax prefill", () => {
    const request = createDraftTransportRequest(transferLeg, null, { adultCount: 2, childCount: 1, infantCount: 1 })
    expect(request.pricingBasis).toBe("per_vehicle")
    expect(request.adultCount).toBeNull()
    expect(request.childCount).toBeNull()
    expect(request.infantCount).toBeNull()
  })

  it("createDraftTransportRequest prefills pax from expectedTotals when the supplier defaults to per_person", () => {
    const perPersonLeg = leg({ ...transferLeg, transferPricingBasis: "per_person" })
    const request = createDraftTransportRequest(perPersonLeg, null, {
      adultCount: 2,
      childCount: 1,
      infantCount: 1,
    })
    expect(request.pricingBasis).toBe("per_person")
    expect(request.adultCount).toBe(2)
    expect(request.childCount).toBe(1)
    expect(request.infantCount).toBe(1)
  })

  it("createDraftTransportRequest is always per_vehicle for a rental, regardless of totals", () => {
    const rentalLeg = leg({
      id: "leg-rental-draft",
      supplierKind: "vehicle_rental",
      transferPricingBasis: "per_person",
    })
    const request = createDraftTransportRequest(rentalLeg, null, { adultCount: 2, childCount: 1, infantCount: 1 })
    expect(request.pricingBasis).toBe("per_vehicle")
    expect(request.adultCount).toBeNull()
  })

  it("defaults selected to true only for the mandatory train leg", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-train").selected).toBe(true)
    expect(suiteState(states, "leg-hotel").selected).toBe(false)
    expect(transportState(states, "leg-transfer").selected).toBe(false)
  })

  it("seeds the first unit's passenger split from booking totals on split legs", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null, totalsBySupplierId: totals })
    const train = suiteState(states, "leg-train")
    expect(train.units[0]).toMatchObject({ adultCount: 2, childCount: 1, infantCount: 0 })
    const hotel = suiteState(states, "leg-hotel")
    expect(hotel.units[0]).toMatchObject({ adultCount: 0, childCount: 0, infantCount: 0 })
  })
})

describe("hydrateFromSaved", () => {
  const saved: SavedPackageState = {
    packageId: "pkg-1",
    tripStartDate: "2026-09-01",
    tripEndDate: "2026-09-05",
    selections: [
      {
        id: "sel-train",
        package_leg_id: "leg-train",
        date_anchor: null,
        selected: true,
        supplier_id: "supplier-leg-train",
        route_id: "route-1",
        route_reversed: true,
        suite_type_id: null,
        service_date: "2026-09-02",
        nights: null,
        rate_type_id: null,
        notes: "window seat",
        units: [
          {
            id: "unit-b",
            suite_type_id: "suite-1",
            bedroom_type_id: "bed-1",
            bedroom_layout_id: null,
            bathroom_type_id: null,
            adult_count: 1,
            child_count: 1,
            infant_count: 0,
            sort_order: 1,
          },
          {
            id: "unit-a",
            suite_type_id: "suite-1",
            bedroom_type_id: null,
            bedroom_layout_id: null,
            bathroom_type_id: null,
            adult_count: 1,
            child_count: 0,
            infant_count: 0,
            sort_order: 0,
          },
        ],
      },
      {
        id: "sel-transfer",
        package_leg_id: "leg-transfer",
        date_anchor: null,
        selected: false,
        supplier_id: "supplier-leg-transfer",
        route_id: null,
        route_reversed: null,
        suite_type_id: null,
        service_date: null,
        nights: null,
        rate_type_id: null,
        notes: null,
        units: [],
      },
    ],
  }

  const savedRequest: BookingTransportRequest = {
    id: "req-1",
    bookingId: "job-1",
    serviceType: "transfer",
    supplierId: "supplier-leg-transfer",
    routeId: null,
    suiteTypeId: "vehicle-1",
    serviceId: "leg-transfer",
    pickupPoint: "Airport",
    dropoffPoint: "Hotel",
    pickupAt: "2026-09-01T08:00:00.000Z",
    dateAnchor: "custom",
    rentalDetails: null,
    passengerCount: 3,
    luggageCount: 2,
    flightNumber: "SA123",
    priceOverride: null,
    priceOverrideSetAt: null,
    complimentary: false,
    notes: null,
    supplierReference: null,
    pricingBasis: "per_vehicle",
    adultCount: null,
    childCount: null,
    infantCount: null,
    priceOverrideChild: null,
    priceOverrideInfant: null,
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  }

  it("maps saved rows into leg state, sorting units by sort_order", () => {
    const states = hydrateFromSaved(pkg, saved, [savedRequest], { tripStartDate: "2026-09-01" })
    const train = suiteState(states, "leg-train")
    expect(train.serviceDate).toBe("2026-09-02")
    expect(train.notes).toBe("window seat")
    expect(train.units.map((u) => u.id)).toEqual(["unit-a", "unit-b"])

    const transfer = transportState(states, "leg-transfer")
    expect(transfer.selected).toBe(false)
    expect(transfer.requests).toEqual([savedRequest])
  })

  it("reads route_reversed for a round_trip route", () => {
    const states = hydrateFromSaved(pkg, saved, [savedRequest], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-train").reversed).toBe(true)
  })

  it("coerces reversed to false when the saved route is not round_trip", () => {
    const oneWayLeg = leg({
      id: "leg-one-way",
      supplierKind: "train_operator",
      sortOrder: 1,
      routes: [
        {
          id: "route-one-way",
          supplierId: "supplier-leg-one-way",
          name: "Cape Town → Pretoria",
          directionMode: "one_way",
          active: true,
          createdAt: "",
          updatedAt: "",
        },
      ] as PackageLeg["routes"],
    })
    const oneWayPkg = detail([oneWayLeg])
    const oneWaySaved: SavedPackageState = {
      packageId: "pkg-1",
      tripStartDate: "2026-09-01",
      tripEndDate: null,
      selections: [
        {
          id: "sel-one-way",
          package_leg_id: "leg-one-way",
          date_anchor: null,
          selected: true,
          supplier_id: "supplier-leg-one-way",
          route_id: "route-one-way",
          route_reversed: true,
          suite_type_id: null,
          service_date: "2026-09-02",
          nights: null,
          rate_type_id: null,
          notes: null,
          units: [],
        },
      ],
    }

    const states = hydrateFromSaved(oneWayPkg, oneWaySaved, [], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-one-way").reversed).toBe(false)
  })

  it("falls back to defaults for legs without a saved selection", () => {
    const states = hydrateFromSaved(pkg, saved, [savedRequest], { tripStartDate: "2026-09-01" })
    const hotel = suiteState(states, "leg-hotel")
    expect(hotel.selected).toBe(false)
    expect(hotel.units).toHaveLength(1)
    expect(hotel.units[0].id.startsWith("draft-")).toBe(true)
  })

  it("keeps a saved stay's own pricing basis when the property has since switched", () => {
    const perRoomPkg = detail(
      pkg.legs.map((packageLeg) =>
        packageLeg.id === "leg-hotel"
          ? { ...packageLeg, accommodationPricingBasis: "per_room" as const }
          : packageLeg,
      ),
    )
    const savedStay: SavedPackageState = {
      ...saved,
      selections: [
        ...saved.selections,
        {
          id: "sel-hotel",
          package_leg_id: "leg-hotel",
          date_anchor: null,
          selected: true,
          supplier_id: "supplier-leg-hotel",
          route_id: "route-bb",
          route_reversed: false,
          suite_type_id: null,
          service_date: "2026-09-04",
          nights: 2,
          rate_type_id: null,
          notes: null,
          accommodation_pricing_basis: "per_person",
          units: [],
        },
      ],
    }

    const states = hydrateFromSaved(perRoomPkg, savedStay, [savedRequest], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-hotel").accommodationPricingBasis).toBe("per_person")
  })

  it("inherits the property's basis for a stay that has none of its own", () => {
    const perRoomPkg = detail(
      pkg.legs.map((packageLeg) =>
        packageLeg.id === "leg-hotel"
          ? { ...packageLeg, accommodationPricingBasis: "per_room" as const }
          : packageLeg,
      ),
    )
    const states = hydrateFromSaved(perRoomPkg, saved, [savedRequest], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-hotel").accommodationPricingBasis).toBe("per_room")
  })
})

describe("toPackageSelectionsPatch", () => {
  it("emits units with sortOrder for suite legs, drops draft ids, and skips units on transport legs", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01" })
    const hotel = suiteState(states, "leg-hotel")
    hotel.routeId = "route-bb"
    hotel.nights = 3
    hotel.units[0].suiteTypeId = "room-1"

    const patch = toPackageSelectionsPatch(states)
    const hotelPatch = patch.selections.find((s) => s.packageLegId === "leg-hotel")
    expect(hotelPatch).toMatchObject({ routeId: "route-bb", nights: 3 })
    expect(hotelPatch?.units?.[0]).toMatchObject({ suiteTypeId: "room-1", sortOrder: 0 })
    expect(hotelPatch?.units?.[0].id).toBeUndefined()

    const transferPatch = patch.selections.find((s) => s.packageLegId === "leg-transfer")
    expect(transferPatch?.units).toBeUndefined()
  })

  it("emits routeReversed for suite legs", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01" })
    const train = suiteState(states, "leg-train")
    train.reversed = true

    const patch = toPackageSelectionsPatch(states)
    const trainPatch = patch.selections.find((s) => s.packageLegId === "leg-train")
    expect(trainPatch?.routeReversed).toBe(true)
  })

  it("keeps persisted unit ids", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const train = suiteState(states, "leg-train")
    train.units = [{ ...train.units[0], id: "3f0e8a2c-0000-4000-8000-000000000001", suiteTypeId: "suite-1" }]
    const patch = toPackageSelectionsPatch(states)
    const trainPatch = patch.selections.find((s) => s.packageLegId === "leg-train")
    expect(trainPatch?.units?.[0].id).toBe("3f0e8a2c-0000-4000-8000-000000000001")
  })
})

describe("toTransportRequestsPut", () => {
  it("keeps manual rows, drops rows tied to a service no longer in state, and reindexes sortOrder", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = { ...transfer.requests[0], pickupPoint: "Airport", dropoffPoint: "Hotel" }

    const manualRow: BookingTransportRequest = {
      ...transfer.requests[0],
      id: "manual-1",
      serviceId: null,
      pickupPoint: "Manual pickup",
    }
    const staleServiceRow: BookingTransportRequest = {
      ...transfer.requests[0],
      id: "stale-1",
      serviceId: "leg-no-longer-in-state",
      pickupPoint: "Stale",
    }

    const body = toTransportRequestsPut(states, [manualRow, staleServiceRow])
    expect(body.transportRequests.map((r) => r.id)).toEqual(["manual-1", transfer.requests[0].id])
    expect(body.transportRequests.map((r) => r.sortOrder)).toEqual([0, 1])
  })

  it("drops requests for deselected transport legs, even with blank draft fields", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = false
    // pickupPoint/dropoffPoint left blank, as a fresh draft would be

    const body = toTransportRequestsPut(states, [])
    expect(body.transportRequests).toEqual([])
  })

  it("round-trips the per-request price override", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = {
      ...transfer.requests[0],
      pickupPoint: "Airport",
      dropoffPoint: "Hotel",
      priceOverride: 1250.5,
    }

    const body = toTransportRequestsPut(states, [])
    expect(body.transportRequests[0].priceOverride).toBe(1250.5)
  })

  it("round-trips the per-request complimentary flag", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = {
      ...transfer.requests[0],
      pickupPoint: "Airport",
      dropoffPoint: "Hotel",
      complimentary: true,
    }

    const body = toTransportRequestsPut(states, [])
    expect(body.transportRequests[0].complimentary).toBe(true)
  })

  it("round-trips the per-person pricing basis, pax counts, and child/infant overrides", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = {
      ...transfer.requests[0],
      pickupPoint: "Airport",
      dropoffPoint: "Hotel",
      pricingBasis: "per_person",
      adultCount: 4,
      childCount: 1,
      infantCount: 0,
      priceOverrideChild: 220,
      priceOverrideInfant: null,
    }

    const body = toTransportRequestsPut(states, [])
    expect(body.transportRequests[0]).toMatchObject({
      pricingBasis: "per_person",
      adultCount: 4,
      childCount: 1,
      infantCount: 0,
      priceOverrideChild: 220,
      priceOverrideInfant: null,
    })
  })

  it("sends dateAnchor for a transfer request, always null for a rental", () => {
    const rentalLeg = leg({ id: "leg-rental", supplierKind: "vehicle_rental", sortOrder: 9 })
    const states = buildDefaultLegStates(detail([transferLeg, rentalLeg]), { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = { ...transfer.requests[0], dateAnchor: "post" }
    const rental = transportState(states, "leg-rental")
    rental.selected = true

    const body = toTransportRequestsPut(states, [])
    expect(body.transportRequests.find((r) => r.serviceId === "leg-transfer")?.dateAnchor).toBe("post")
    expect(body.transportRequests.find((r) => r.serviceId === "leg-rental")?.dateAnchor).toBeNull()
  })
})

// pkg is Train(1) -> Hotel(2) -> Transfer(3), so leg-transfer anchors to the hotel — these tests
// build a second itinerary shape (Train -> Transfer -> Hotel -> Transfer) to cover a transfer that
// anchors straight to the train, one that anchors to a hotel, and one with nothing above it.
// Two pre-stay hotels ahead of one train, joined by a transfer between them — the job 42369 shape
// (Victoria Falls Safari Collection, then a transfer, then Victoria Falls Hotel, then Rovos Rail).
describe("chained hotel date anchors", () => {
  const chainHotelA = { ...hotelLeg, id: "leg-hotel-a", sortOrder: 1 }
  const chainHotelB = { ...hotelLeg, id: "leg-hotel-b", sortOrder: 3 }
  const chainTransfer = leg({ id: "leg-transfer-mid", supplierKind: "transfers", sortOrder: 2 })
  const chainTrain = { ...trainLeg, sortOrder: 4 }
  const twoHotelPkg = detail([chainHotelA, chainTransfer, chainTrain, chainHotelB])

  it("lays two pre-stay hotels end to end instead of both landing on departure day", () => {
    let states = buildDefaultLegStates(twoHotelPkg, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train").serviceDate = "2026-09-15"
    const hotelA = suiteState(states, "leg-hotel-a")
    hotelA.selected = true
    hotelA.dateAnchor = "pre"
    hotelA.nights = 1
    const hotelB = suiteState(states, "leg-hotel-b")
    hotelB.selected = true
    hotelB.dateAnchor = "pre"
    hotelB.nights = 1

    states = applyAnchoredHotelDates(twoHotelPkg, states)

    expect(suiteState(states, "leg-hotel-a").serviceDate).toBe("2026-09-13")
    expect(suiteState(states, "leg-hotel-b").serviceDate).toBe("2026-09-14")
  })

  it("re-chains when nights change on either stay", () => {
    let states = buildDefaultLegStates(twoHotelPkg, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train").serviceDate = "2026-09-15"
    suiteState(states, "leg-hotel-a").selected = true
    suiteState(states, "leg-hotel-a").dateAnchor = "pre"
    suiteState(states, "leg-hotel-a").nights = 2
    suiteState(states, "leg-hotel-b").selected = true
    suiteState(states, "leg-hotel-b").dateAnchor = "pre"
    suiteState(states, "leg-hotel-b").nights = 1

    states = applyAnchoredHotelDates(twoHotelPkg, states)

    expect(suiteState(states, "leg-hotel-a").serviceDate).toBe("2026-09-12")
    expect(suiteState(states, "leg-hotel-b").serviceDate).toBe("2026-09-14")
  })

  it("leaves a custom-anchored hotel untouched and does not let it shift its neighbour", () => {
    let states = buildDefaultLegStates(twoHotelPkg, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train").serviceDate = "2026-09-15"
    const hotelA = suiteState(states, "leg-hotel-a")
    hotelA.selected = true
    hotelA.dateAnchor = "custom"
    hotelA.serviceDate = "2026-09-01"
    hotelA.nights = 1
    const hotelB = suiteState(states, "leg-hotel-b")
    hotelB.selected = true
    hotelB.dateAnchor = "pre"
    hotelB.nights = 1

    states = applyAnchoredHotelDates(twoHotelPkg, states)

    expect(suiteState(states, "leg-hotel-a").serviceDate).toBe("2026-09-01")
    expect(suiteState(states, "leg-hotel-b").serviceDate).toBe("2026-09-14")
  })

  it("toHotelAnchorContext reports the chained stay, matching what applyAnchoredHotelDates saves", () => {
    const states = buildDefaultLegStates(twoHotelPkg, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train").serviceDate = "2026-09-15"
    suiteState(states, "leg-hotel-a").selected = true
    suiteState(states, "leg-hotel-a").dateAnchor = "pre"
    suiteState(states, "leg-hotel-a").nights = 1
    suiteState(states, "leg-hotel-b").selected = true
    suiteState(states, "leg-hotel-b").dateAnchor = "pre"
    suiteState(states, "leg-hotel-b").nights = 1

    const contextA = toHotelAnchorContext(twoHotelPkg, states, "leg-hotel-a")
    const contextB = toHotelAnchorContext(twoHotelPkg, states, "leg-hotel-b")

    expect(contextA?.stayDates).toEqual({ checkIn: "2026-09-13", checkOut: "2026-09-14" })
    expect(contextB?.stayDates).toEqual({ checkIn: "2026-09-14", checkOut: "2026-09-15" })
  })

  it("keeps two hotels anchored to different trains in separate groups", () => {
    const trainA = { ...trainLeg, id: "leg-train-a", sortOrder: 0 }
    const trainB = { ...trainLeg, id: "leg-train-b", sortOrder: 3 }
    const hotelA = { ...hotelLeg, id: "leg-hotel-a", sortOrder: 1 }
    const hotelB = { ...hotelLeg, id: "leg-hotel-b", sortOrder: 2 }
    const pkgTwoTrains = detail([trainA, hotelA, hotelB, trainB])

    let states = buildDefaultLegStates(pkgTwoTrains, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train-a").serviceDate = "2026-09-10"
    suiteState(states, "leg-train-b").serviceDate = "2026-09-20"
    // hotelA sits after train-a and before train-b: pre-anchoring it should resolve forward to
    // the nearer following train (train-b), per findAnchorTrainLeg's fallback rule.
    const stateA = suiteState(states, "leg-hotel-a")
    stateA.selected = true
    stateA.dateAnchor = "pre"
    stateA.nights = 1
    const stateB = suiteState(states, "leg-hotel-b")
    stateB.selected = true
    stateB.dateAnchor = "pre"
    stateB.nights = 1

    states = applyAnchoredHotelDates(pkgTwoTrains, states)

    // Both anchor to train-b (pre, nearest following train) and chain to each other rather than
    // each independently landing on 2026-09-19 — this is the same grouping behaviour as the
    // one-train case, just confirming a second train in the package doesn't create a bad group.
    expect(suiteState(states, "leg-hotel-a").serviceDate).toBe("2026-09-18")
    expect(suiteState(states, "leg-hotel-b").serviceDate).toBe("2026-09-19")
  })
})

describe("transfer date anchors", () => {
  const chainTransfer1 = leg({ id: "leg-transfer-1", supplierKind: "transfers", sortOrder: 2 })
  const chainTransfer2 = leg({ id: "leg-transfer-2", supplierKind: "transfers", sortOrder: 4 })
  const chainHotel = { ...hotelLeg, sortOrder: 3 }
  // A 3-day route, unlike the bare trainLeg fixture (no durationDays), so Post resolves to a real
  // arrival day rather than immediately hitting the "no journey length set" fallback.
  const chainTrain = {
    ...trainLeg,
    sortOrder: 1,
    routes: [{ ...trainLeg.routes[0], durationDays: 3 }] as PackageLeg["routes"],
  }
  const chainPkg = detail([chainTrain, chainTransfer1, chainHotel, chainTransfer2])

  function anchoredRequest(states: ApplyLegState[], legId: string, anchor: "pre" | "post"): TransportLegState {
    const state = transportState(states, legId)
    state.selected = true
    state.requests[0] = { ...state.requests[0], dateAnchor: anchor }
    return state
  }

  it("anchors the first transfer to the train directly above it", () => {
    const states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-10" })
    const context = getTransferAnchorContext(chainPkg, states, "leg-transfer-1")
    expect(context?.anchorLeg.id).toBe("leg-train")
    expect(context?.span).toEqual({ start: "2026-09-10", end: "2026-09-12" }) // route-1 has no durationDays set here
  })

  it("returns null for a transfer with nothing dated above it", () => {
    const states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-10" })
    expect(getTransferAnchorContext(chainPkg, states, "leg-train")).toBeNull()
  })

  it("resolves pre/post off the leg above via applyAnchoredTransferDates, preserving the typed time", () => {
    const states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train").serviceDate = "2026-09-10"
    const hotel = suiteState(states, "leg-hotel")
    hotel.selected = true
    hotel.dateAnchor = "custom"
    hotel.serviceDate = "2026-09-12"
    hotel.nights = 2

    anchoredRequest(states, "leg-transfer-1", "post")
    transportState(states, "leg-transfer-1").requests[0].pickupAt = joinLocalDateTime("2026-01-01", "07:30")
    anchoredRequest(states, "leg-transfer-2", "post")

    const recomputed = applyAnchoredTransferDates(chainPkg, states)
    const transfer1 = transportState(recomputed, "leg-transfer-1")
    const transfer2 = transportState(recomputed, "leg-transfer-2")

    // Post-train: the transfer's date moves to the train's arrival day; the 07:30 pickup time
    // typed before the anchor was resolved survives the re-derive.
    expect(splitLocalDateTime(transfer1.requests[0].pickupAt)).toEqual({ date: "2026-09-12", time: "07:30" })
    // Post-hotel: the second transfer picks up on the hotel's check-out day (check-in + 2 nights).
    expect(splitLocalDateTime(transfer2.requests[0].pickupAt).date).toBe("2026-09-14")
  })

  it("chains through applyAnchoredDates: moving the train's date re-dates the hotel, which re-dates the transfer below it", () => {
    let states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-10" })
    suiteState(states, "leg-train").serviceDate = "2026-09-10"
    const hotel = suiteState(states, "leg-hotel")
    hotel.selected = true
    hotel.dateAnchor = "post"
    hotel.nights = 2
    anchoredRequest(states, "leg-transfer-2", "post")

    states = applyAnchoredDates(chainPkg, states)
    expect(suiteState(states, "leg-hotel").serviceDate).toBe("2026-09-12")
    expect(splitLocalDateTime(transportState(states, "leg-transfer-2").requests[0].pickupAt).date).toBe("2026-09-14")

    // Push the train back a day — the hotel and the transfer under it should both follow.
    suiteState(states, "leg-train").serviceDate = "2026-09-09"
    states = applyAnchoredDates(chainPkg, states)
    expect(suiteState(states, "leg-hotel").serviceDate).toBe("2026-09-11")
    expect(splitLocalDateTime(transportState(states, "leg-transfer-2").requests[0].pickupAt).date).toBe("2026-09-13")
  })

  it("leaves pickupAt untouched for a custom-anchored request", () => {
    const states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-10" })
    const transfer = transportState(states, "leg-transfer-1")
    transfer.selected = true
    const customPickupAt = joinLocalDateTime("2026-01-01", "05:00")
    transfer.requests[0] = { ...transfer.requests[0], dateAnchor: "custom", pickupAt: customPickupAt }

    const recomputed = applyAnchoredTransferDates(chainPkg, states)
    expect(transportState(recomputed, "leg-transfer-1").requests[0].pickupAt).toBe(customPickupAt)
  })

  it("flags an unresolved anchor in validateConfigureState with a next step", () => {
    const states = buildDefaultLegStates(chainPkg, { tripStartDate: null })
    // No service date set on the train, so the anchor above leg-transfer-1 can't resolve yet.
    const transfer = anchoredRequest(states, "leg-transfer-1", "post")
    transfer.requests[0] = { ...transfer.requests[0], suiteTypeId: "vehicle-1" }

    const errors = validateConfigureState(chainPkg, states)
    expect(errors.some((e) => e.includes("Supplier leg-train") && e.includes("pick a custom pickup date"))).toBe(
      true,
    )
  })

  it("toTransferAnchorContext flags a missing route duration as assumed", () => {
    const noDurationPkg = detail([{ ...chainTrain, routes: [{ ...chainTrain.routes[0], durationDays: null }] }, chainTransfer1])
    const states = buildDefaultLegStates(noDurationPkg, { tripStartDate: "2026-09-10" })
    const context = toTransferAnchorContext(noDurationPkg, states, "leg-transfer-1")
    expect(context?.endDateAssumed).toBe(true)
    expect(context?.startDate).toBe(context?.endDate)
  })
})

// Train(1) -> Hotel(2, 2 nights) -> Airline(3) -> Transfer(4), so the airline anchors to the hotel
// above it and the transfer anchors to the airline above it — covers the three-stage chain order
// in applyAnchoredDates (hotel settles, then airline, then transfer).
describe("airline date anchors", () => {
  // A 3-day route, unlike the bare trainLeg fixture (no durationDays), so a post-hotel/post-airline
  // anchor resolves to a real arrival day rather than immediately hitting the same-day fallback.
  const chainTrain = {
    ...trainLeg,
    routes: [{ ...trainLeg.routes[0], durationDays: 3 }] as PackageLeg["routes"],
  }
  const chainHotel2 = { ...hotelLeg, sortOrder: 2 }
  const chainAirline = leg({ id: "leg-airline", supplierKind: "airline", sortOrder: 3 })
  const chainTransfer = leg({ id: "leg-transfer-3", supplierKind: "transfers", sortOrder: 4 })
  const chainPkg = detail([chainTrain, chainHotel2, chainAirline, chainTransfer])

  it("defaults dateAnchor to custom and round-trips a saved anchor for an airline leg", () => {
    const defaults = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-01" })
    expect(suiteState(defaults, "leg-airline").dateAnchor).toBe("custom")

    const saved: SavedPackageState = {
      packageId: "pkg-1",
      tripStartDate: "2026-09-01",
      tripEndDate: null,
      selections: [
        {
          id: "sel-airline",
          package_leg_id: "leg-airline",
          date_anchor: "pre",
          selected: true,
          supplier_id: "supplier-leg-airline",
          route_id: null,
          route_reversed: null,
          suite_type_id: null,
          service_date: "2026-09-03",
          nights: null,
          rate_type_id: null,
          notes: null,
          units: [],
        },
      ],
    }
    const hydrated = hydrateFromSaved(chainPkg, saved, [], { tripStartDate: "2026-09-01" })
    expect(suiteState(hydrated, "leg-airline").dateAnchor).toBe("pre")

    const patch = toPackageSelectionsPatch(hydrated)
    expect(patch.selections.find((s) => s.packageLegId === "leg-airline")?.dateAnchor).toBe("pre")
  })

  it("applyAnchoredAirlineDates resolves departure from the leg above, leaving arrivalDate untouched", () => {
    const states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-01" })
    suiteState(states, "leg-train").serviceDate = "2026-09-01"
    const hotel = suiteState(states, "leg-hotel")
    hotel.selected = true
    hotel.dateAnchor = "custom"
    hotel.serviceDate = "2026-09-02"
    hotel.nights = 2

    const airline = suiteState(states, "leg-airline")
    airline.selected = true
    airline.dateAnchor = "post"
    airline.arrivalDate = "2026-09-01" // untouched sentinel

    const recomputed = applyAnchoredAirlineDates(chainPkg, states)
    // Post-hotel: departs the hotel's check-out day (check-in 09-02 + 2 nights = 09-04).
    expect(suiteState(recomputed, "leg-airline").serviceDate).toBe("2026-09-04")
    expect(suiteState(recomputed, "leg-airline").arrivalDate).toBe("2026-09-01")
  })

  it("chains hotel -> airline -> transfer through applyAnchoredDates", () => {
    let states = buildDefaultLegStates(chainPkg, { tripStartDate: "2026-09-01" })
    suiteState(states, "leg-train").serviceDate = "2026-09-01"
    const hotel = suiteState(states, "leg-hotel")
    hotel.selected = true
    hotel.dateAnchor = "post"
    hotel.nights = 2

    const airline = suiteState(states, "leg-airline")
    airline.selected = true
    airline.dateAnchor = "post"

    const transfer = transportState(states, "leg-transfer-3")
    transfer.selected = true
    transfer.requests[0] = { ...transfer.requests[0], dateAnchor: "pre" }

    states = applyAnchoredDates(chainPkg, states)

    expect(suiteState(states, "leg-hotel").serviceDate).toBe("2026-09-03") // train arrival day
    expect(suiteState(states, "leg-airline").serviceDate).toBe("2026-09-05") // hotel check-out day
    expect(splitLocalDateTime(transportState(states, "leg-transfer-3").requests[0].pickupAt).date).toBe(
      "2026-09-05",
    ) // pre-airline: pickup on the flight's own departure day
  })
})

describe("toApplySelections", () => {
  it("sends units for suite legs and a fallback vehicle category for transport legs", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null, totalsBySupplierId: totals })
    const train = suiteState(states, "leg-train")
    train.units[0].suiteTypeId = "suite-1"
    train.reversed = true
    const hotel = suiteState(states, "leg-hotel")
    hotel.routeId = "route-fb"
    hotel.nights = 2
    hotel.units[0].suiteTypeId = "room-1"
    const transfer = transportState(states, "leg-transfer")
    transfer.requests[0] = { ...transfer.requests[0], suiteTypeId: "vehicle-1" }

    const selections = toApplySelections(states, { "leg-train": { type: "percent", value: 10 } })

    const trainSel = selections.find((s) => s.legId === "leg-train")
    expect(trainSel?.units).toEqual([
      {
        // A draft room has no persisted id to send, and a train leg never carries a room or tour
        // override or a gifted night — those are hotel/tour-only and the server rejects them
        // elsewhere.
        unitId: undefined,
        manualRoomPrice: null,
        complimentaryFirstNight: false,
        manualTourPrice: null,
        suiteTypeId: "suite-1",
        bedroomTypeId: null,
        bedroomLayoutId: null,
        bathroomTypeId: null,
        adultCount: 2,
        childCount: 1,
        infantCount: 0,
        manualAdultPrice: null,
        manualChildPrice: null,
        manualInfantPrice: null,
      },
    ])
    expect(trainSel?.commissionOverride).toEqual({ type: "percent", value: 10 })
    expect(trainSel?.routeReversed).toBe(true)
    expect(trainSel?.nights).toBeUndefined()

    const hotelSel = selections.find((s) => s.legId === "leg-hotel")
    expect(hotelSel).toMatchObject({ routeId: "route-fb", nights: 2 })

    const transferSel = selections.find((s) => s.legId === "leg-transfer")
    expect(transferSel?.suiteTypeId).toBe("vehicle-1")
    expect(transferSel?.units).toBeUndefined()
  })
})

describe("per-leg rate types", () => {
  it("buildDefaultLegStates leaves every leg on inherit", () => {
    // Legs start with no explicit rate type so pricing walks the supplier's quoted rate, its base
    // rate, then the system default. Seeding a concrete value here would turn every leg into the
    // hard contract selectRateCard applies to hand-picked rates.
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    expect(states.every((state) => state.rateTypeId === null)).toBe(true)
  })

  it("hydrateFromSaved restores a saved rate_type_id and leaves the rest inheriting", () => {
    const saved: SavedPackageState = {
      packageId: "pkg-1",
      tripStartDate: "2026-09-01",
      tripEndDate: null,
      selections: [
        {
          id: "sel-train",
          package_leg_id: "leg-train",
          date_anchor: null,
          selected: true,
          supplier_id: "supplier-leg-train",
          route_id: "route-1",
          route_reversed: null,
          suite_type_id: null,
          service_date: "2026-09-02",
          nights: null,
          rate_type_id: "rate-resident",
          notes: null,
          units: [],
        },
        {
          id: "sel-transfer",
          package_leg_id: "leg-transfer",
          date_anchor: null,
          selected: true,
          supplier_id: "supplier-leg-transfer",
          route_id: null,
          route_reversed: null,
          suite_type_id: null,
          service_date: null,
          nights: null,
          rate_type_id: null,
          notes: null,
          units: [],
        },
      ],
    }

    const states = hydrateFromSaved(pkg, saved, [], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-train").rateTypeId).toBe("rate-resident")
    expect(transportState(states, "leg-transfer").rateTypeId).toBeNull()
    // Leg with no saved row keeps inheriting.
    expect(suiteState(states, "leg-hotel").rateTypeId).toBeNull()
  })

  it("hydrateFromSaved discards a persisted tour itinerary that belongs to a different tour type", () => {
    // Reproduces the LTT-2026-0012 bug: booking_services.route_id was stamped onto a leg whose
    // unit is booked under a different tour type than the persisted itinerary describes. Trusting
    // it as-is would surface the wrong itinerary (and, via lib/invoices, the wrong tour name).
    const tourLeg = leg({
      id: "leg-tour",
      supplierKind: "tour_operator",
      routes: [
        { id: "route-heli", supplierId: "supplier-leg-tour", name: "Helicopter Flight", suiteTypeId: "tour-heli", active: true, createdAt: "", updatedAt: "" },
      ] as PackageLeg["routes"],
      suiteTypes: [
        { id: "tour-heli", supplierId: "supplier-leg-tour", name: "Helicopter Flight", active: true, createdAt: "", updatedAt: "" },
        { id: "tour-cruise", supplierId: "supplier-leg-tour", name: "Sundowner Cruise", active: true, createdAt: "", updatedAt: "" },
      ] as PackageLeg["suiteTypes"],
    })
    const tourPkg = detail([tourLeg])
    const saved: SavedPackageState = {
      packageId: "pkg-1",
      tripStartDate: "2026-09-01",
      tripEndDate: null,
      selections: [
        {
          id: "sel-tour",
          package_leg_id: "leg-tour",
          date_anchor: null,
          selected: true,
          supplier_id: "supplier-leg-tour",
          // Persisted itinerary names the Helicopter tour, but the booked unit is Sundowner Cruise.
          route_id: "route-heli",
          route_reversed: null,
          suite_type_id: null,
          service_date: "2026-09-14",
          nights: null,
          rate_type_id: null,
          notes: null,
          units: [
            {
              id: "unit-a",
              suite_type_id: "tour-cruise",
              bedroom_type_id: null,
              bedroom_layout_id: null,
              bathroom_type_id: null,
              adult_count: 2,
              child_count: 0,
              infant_count: 0,
              sort_order: 0,
            },
          ],
        },
      ],
    }

    const states = hydrateFromSaved(tourPkg, saved, [], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-tour").routeId).toBeNull()
  })

  it("hydrateFromSaved keeps a persisted tour itinerary that matches the booked tour type", () => {
    const tourLeg = leg({
      id: "leg-tour",
      supplierKind: "tour_operator",
      routes: [
        { id: "route-cruise", supplierId: "supplier-leg-tour", name: "Sundowner Cruise", suiteTypeId: "tour-cruise", active: true, createdAt: "", updatedAt: "" },
      ] as PackageLeg["routes"],
      suiteTypes: [
        { id: "tour-cruise", supplierId: "supplier-leg-tour", name: "Sundowner Cruise", active: true, createdAt: "", updatedAt: "" },
      ] as PackageLeg["suiteTypes"],
    })
    const tourPkg = detail([tourLeg])
    const saved: SavedPackageState = {
      packageId: "pkg-1",
      tripStartDate: "2026-09-01",
      tripEndDate: null,
      selections: [
        {
          id: "sel-tour",
          package_leg_id: "leg-tour",
          date_anchor: null,
          selected: true,
          supplier_id: "supplier-leg-tour",
          route_id: "route-cruise",
          route_reversed: null,
          suite_type_id: null,
          service_date: "2026-09-14",
          nights: null,
          rate_type_id: null,
          notes: null,
          units: [
            {
              id: "unit-a",
              suite_type_id: "tour-cruise",
              bedroom_type_id: null,
              bedroom_layout_id: null,
              bathroom_type_id: null,
              adult_count: 2,
              child_count: 0,
              infant_count: 0,
              sort_order: 0,
            },
          ],
        },
      ],
    }

    const states = hydrateFromSaved(tourPkg, saved, [], { tripStartDate: "2026-09-01" })
    expect(suiteState(states, "leg-tour").routeId).toBe("route-cruise")
  })

  it("toPackageSelectionsPatch emits rateTypeId for suite and transport legs", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const train = suiteState(states, "leg-train")
    train.rateTypeId = "rate-resident"
    const transfer = transportState(states, "leg-transfer")
    transfer.rateTypeId = "rate-std"

    const patch = toPackageSelectionsPatch(states)
    expect(patch.selections.find((s) => s.packageLegId === "leg-train")?.rateTypeId).toBe("rate-resident")
    expect(patch.selections.find((s) => s.packageLegId === "leg-transfer")?.rateTypeId).toBe("rate-std")
  })

  it("toApplySelections emits rateTypeId per leg and omits it when inheriting", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    suiteState(states, "leg-train").rateTypeId = "rate-std"
    transportState(states, "leg-transfer").rateTypeId = "rate-std"

    const selections = toApplySelections(states)
    expect(selections.find((s) => s.legId === "leg-train")?.rateTypeId).toBe("rate-std")
    expect(selections.find((s) => s.legId === "leg-transfer")?.rateTypeId).toBe("rate-std")
    expect(selections.find((s) => s.legId === "leg-hotel")?.rateTypeId).toBeUndefined()
  })
})

describe("validateConfigureState", () => {
  it("passes a fully configured state", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01", totalsBySupplierId: totals })
    suiteState(states, "leg-train").units[0].suiteTypeId = "suite-1"
    const hotel = suiteState(states, "leg-hotel")
    hotel.selected = true
    hotel.routeId = "route-bb"
    hotel.units[0].suiteTypeId = "room-1"
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = {
      ...transfer.requests[0],
      pickupPoint: "Airport",
      dropoffPoint: "Hotel",
      suiteTypeId: "vehicle-1",
    }

    expect(validateConfigureState(pkg, states, { totalsBySupplierId: totals })).toEqual([])
  })

  it("flags missing route, unit type, and passenger sum mismatches, but pickup/drop-off is optional", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    suiteState(states, "leg-hotel").selected = true
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    // Route quick-fill seeds pickup/drop-off; blank them to confirm they're no longer required.
    transfer.requests[0] = { ...transfer.requests[0], pickupPoint: "", dropoffPoint: "" }
    const errors = validateConfigureState(pkg, states, { totalsBySupplierId: totals })
    expect(errors.some((e) => e.includes("meal plan"))).toBe(true) // hotel has 2 routes, none chosen
    expect(errors.some((e) => e.includes("needs a type"))).toBe(true)
    expect(errors.some((e) => e.includes("pickup point"))).toBe(false)
    expect(errors.some((e) => e.includes("vehicle category"))).toBe(true)
    expect(errors.some((e) => e.includes("suites hold") && e.includes("but the booking is for"))).toBe(true) // split defaulted to 0s
  })

  it("uses the supplier's own noun for a missing unit type — cabin for airline, room for hotel", () => {
    const airlineLeg = leg({
      id: "leg-airline-cabin",
      supplierKind: "airline",
      sortOrder: 5,
      routes: [
        {
          id: "route-air",
          supplierId: "supplier-leg-airline-cabin",
          name: "CPT-JNB",
          originLocationId: null,
          destinationLocationId: null,
          active: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
      suiteTypes: [
        { id: "cabin-1", supplierId: "supplier-leg-airline-cabin", name: "Business", active: true, createdAt: "", updatedAt: "" },
      ],
    })
    const airlinePkg = detail([airlineLeg])
    const states = buildDefaultLegStates(airlinePkg, { tripStartDate: null })
    suiteState(states, "leg-airline-cabin").selected = true

    const errors = validateConfigureState(airlinePkg, states)
    expect(errors.some((e) => e.includes("cabin 1 needs a type"))).toBe(true)
    expect(errors.some((e) => e.includes("suite") || e.includes("room"))).toBe(false)
  })

  it("flags a supplier with no unit types at all, instead of asking to pick one", () => {
    const bareAirlineLeg = leg({
      id: "leg-airline-bare",
      supplierKind: "airline",
      sortOrder: 6,
      routes: [
        {
          id: "route-air-bare",
          supplierId: "supplier-leg-airline-bare",
          name: "CPT-JNB",
          originLocationId: null,
          destinationLocationId: null,
          active: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
    })
    const barePkg = detail([bareAirlineLeg])
    const states = buildDefaultLegStates(barePkg, { tripStartDate: null })
    suiteState(states, "leg-airline-bare").selected = true

    const errors = validateConfigureState(barePkg, states)
    expect(
      errors.some((e) => e.includes("no cabins set up for this supplier — add one in Suppliers first")),
    ).toBe(true)
    // Nothing to pick a type from yet, so the per-unit "needs a type" noise is skipped.
    expect(errors.some((e) => e.includes("needs a type"))).toBe(false)
  })

  it("does not require routes on transport legs but still flags missing vehicle categories", () => {
    const noRouteLeg = leg({ id: "leg-no-route", supplierKind: "transfers", sortOrder: 4 })
    const noRoutePkg = detail([noRouteLeg])
    const states = buildDefaultLegStates(noRoutePkg, { tripStartDate: null })
    const noRoute = transportState(states, "leg-no-route")
    noRoute.selected = true
    noRoute.requests[0] = { ...noRoute.requests[0], pickupPoint: "Airport", dropoffPoint: "Hotel" }

    const errors = validateConfigureState(noRoutePkg, states)
    // Routes are only quick-fill templates for transfers — never required.
    expect(errors.some((e) => e.includes("no routes configured"))).toBe(false)
    expect(errors.some((e) => e.includes("select a route"))).toBe(false)
    expect(errors.some((e) => e.includes("no vehicle categories configured"))).toBe(true)
  })

  it("skips validation for unselected legs and requires rental return date", () => {
    const rentalLeg = leg({ id: "leg-rental", supplierKind: "vehicle_rental", sortOrder: 1 })
    const rentalPkg = detail([rentalLeg])
    const states = buildDefaultLegStates(rentalPkg, { tripStartDate: null })
    const rental = transportState(states, "leg-rental")
    rental.selected = true
    rental.requests[0] = { ...rental.requests[0], pickupPoint: "Depot", dropoffPoint: "Depot" }

    const errors = validateConfigureState(rentalPkg, states)
    expect(errors.some((e) => e.includes("return date/time"))).toBe(true)

    rental.selected = false
    expect(validateConfigureState(rentalPkg, states)).toEqual([])
  })

  describe("tour operator independence", () => {
    const tourLeg = leg({
      id: "leg-tour",
      supplierKind: "tour_operator",
      sortOrder: 7,
      // No itineraries at all -- a tour operator prices the tour type, and an itinerary is
      // descriptive copy only, so this must not be treated as "unconfigured" the way a train
      // with zero routes would be.
      routes: [],
      suiteTypes: [
        { id: "tour-falls", supplierId: "supplier-leg-tour", name: "Tour of the Falls", active: true, createdAt: "", updatedAt: "" },
        { id: "tour-cruise", supplierId: "supplier-leg-tour", name: "Sundowner Cruise", active: true, createdAt: "", updatedAt: "" },
      ] as PackageLeg["suiteTypes"],
      rateCards: [
        {
          id: "rate-tour-falls",
          routeId: null,
          suiteTypeId: "tour-falls",
          rateTypeId: "rate-type-default",
          pricePerPerson: 850,
          childPrice: null,
          infantPrice: null,
          currency: "ZAR",
          validFrom: "2026-01-01",
          validTo: null,
          createdAt: "",
        },
        {
          id: "rate-tour-cruise",
          routeId: null,
          suiteTypeId: "tour-cruise",
          rateTypeId: "rate-type-default",
          pricePerPerson: 450,
          childPrice: null,
          infantPrice: null,
          currency: "ZAR",
          validFrom: "2026-01-01",
          validTo: null,
          createdAt: "",
        },
      ] as PackageLeg["rateCards"],
    })
    const tourPkg = detail([tourLeg])
    const tourTotals = { "supplier-leg-tour": { adultCount: 2, childCount: 0, infantCount: 0 } }

    it("never asks for an itinerary, however many tour types are booked", () => {
      const states = buildDefaultLegStates(tourPkg, { tripStartDate: "2026-09-01", totalsBySupplierId: tourTotals })
      const tour = suiteState(states, "leg-tour")
      tour.selected = true
      tour.units[0].suiteTypeId = "tour-falls"
      tour.units.push({ ...tour.units[0], id: "draft-2", suiteTypeId: "tour-cruise" })

      const errors = validateConfigureState(tourPkg, states, { totalsBySupplierId: tourTotals })
      expect(errors.some((e) => e.includes("no routes configured"))).toBe(false)
      expect(errors.some((e) => e.includes("no itineraries configured"))).toBe(false)
    })

    it("does not require each tour's own headcount to sum to the booking total", () => {
      const states = buildDefaultLegStates(tourPkg, { tripStartDate: "2026-09-01", totalsBySupplierId: tourTotals })
      const tour = suiteState(states, "leg-tour")
      tour.selected = true
      // Both tours carry the booking's full 2 adults -- the same travellers doing two different
      // things, not two adults split across them.
      tour.units[0] = { ...tour.units[0], suiteTypeId: "tour-falls", adultCount: 2 }
      tour.units.push({ ...tour.units[0], id: "draft-2", suiteTypeId: "tour-cruise", adultCount: 2 })

      const errors = validateConfigureState(tourPkg, states, { totalsBySupplierId: tourTotals })
      expect(errors.some((e) => e.includes("hold") && e.includes("but the booking is for"))).toBe(false)
    })

    it("still requires a train's units to sum to the booking total (regression)", () => {
      const states = buildDefaultLegStates(pkg, { tripStartDate: "2026-09-01", totalsBySupplierId: totals })
      const train = suiteState(states, "leg-train")
      train.units[0] = { ...train.units[0], suiteTypeId: "suite-1", adultCount: 1 }

      const errors = validateConfigureState(pkg, states, { totalsBySupplierId: totals })
      expect(errors.some((e) => e.includes("suites hold") && e.includes("but the booking is for"))).toBe(true)
    })
  })

  // Mirrors the server-side rule in lib/quotes/build-from-package.ts: a chosen rate type that has
  // no card for the date is caught here so the salesperson sees it on the leg, not at Apply.
  describe("chosen rate type", () => {
    const SADC = "rate-type-rvsadc"
    const ratePkg = detail([
      {
        ...trainLeg,
        rateCards: [
          ...trainLeg.rateCards,
          {
            id: "rate-train-sadc",
            routeId: "route-1",
            suiteTypeId: "suite-1",
            rateTypeId: SADC,
            pricePerPerson: 500,
            childPrice: null,
            infantPrice: null,
            currency: "ZAR",
            validFrom: "2026-06-30",
            validTo: "2026-09-30",
            createdAt: "",
          },
        ] as PackageLeg["rateCards"],
      },
    ])

    function stateFor(serviceDate: string, rateTypeId: string | null) {
      const states = buildDefaultLegStates(ratePkg, { tripStartDate: serviceDate })
      const train = suiteState(states, "leg-train")
      train.selected = true
      train.units[0].suiteTypeId = "suite-1"
      train.rateTypeId = rateTypeId
      return states
    }

    const rateTypes = [{ id: SADC, name: "Rovos Rail SADC" }]

    it("flags a chosen rate whose card does not cover the service date", () => {
      const errors = validateConfigureState(ratePkg, stateFor("2028-08-25", SADC), { rateTypes })
      expect(errors.some((e) => e.includes('no "Rovos Rail SADC" rate covers 2028-08-25'))).toBe(true)
    })

    it("stays silent when the chosen rate has a valid card", () => {
      expect(validateConfigureState(ratePkg, stateFor("2026-08-25", SADC), { rateTypes })).toEqual([])
    })

    it("stays silent when no rate type is chosen — a default will be inherited", () => {
      expect(validateConfigureState(ratePkg, stateFor("2028-08-25", null), { rateTypes })).toEqual([])
    })

    it("still blocks without rate-type names loaded, naming the raw id", () => {
      const errors = validateConfigureState(ratePkg, stateFor("2028-08-25", SADC))
      expect(errors.some((e) => e.includes(SADC))).toBe(true)
    })
  })
})
