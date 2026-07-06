import { describe, expect, it } from "vitest"
import type { BookingTransportRequest, PackageDetail, PackageLeg, SupplierKind } from "@/lib/types"
import {
  buildDefaultLegStates,
  hydrateFromSaved,
  toApplySelections,
  toPackageSelectionsPatch,
  toTransportRequestsPut,
  validateConfigureState,
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
    label: null,
    sortOrder: 0,
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
    { id: "route-1", supplierId: "supplier-leg-train", name: "CPT-PTA", active: true, createdAt: "", updatedAt: "" },
  ] as PackageLeg["routes"],
  suiteTypes: [
    { id: "suite-1", supplierId: "supplier-leg-train", name: "Deluxe", active: true, createdAt: "", updatedAt: "" },
  ] as PackageLeg["suiteTypes"],
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
})

const transferLeg = leg({
  id: "leg-transfer",
  supplierKind: "transfers",
  sortOrder: 3,
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
    expect(train.units).toHaveLength(1)
    expect(train.serviceDate).toBe("2026-09-01")

    const hotel = suiteState(states, "leg-hotel")
    expect(hotel.routeId).toBeNull() // two routes: user must choose
    expect(hotel.nights).toBe(1)

    const transfer = transportState(states, "leg-transfer")
    expect(transfer.requests).toHaveLength(1)
    expect(transfer.requests[0].serviceType).toBe("transfer")
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
        selected: true,
        supplier_id: "supplier-leg-train",
        route_id: "route-1",
        suite_type_id: null,
        service_date: "2026-09-02",
        nights: null,
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
        selected: false,
        supplier_id: "supplier-leg-transfer",
        route_id: null,
        suite_type_id: null,
        service_date: null,
        nights: null,
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
    packageLegId: "leg-transfer",
    pickupPoint: "Airport",
    dropoffPoint: "Hotel",
    pickupAt: "2026-09-01T08:00:00.000Z",
    rentalDetails: null,
    passengerCount: 3,
    luggageCount: 2,
    flightNumber: "SA123",
    notes: null,
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

  it("falls back to defaults for legs without a saved selection", () => {
    const states = hydrateFromSaved(pkg, saved, [savedRequest], { tripStartDate: "2026-09-01" })
    const hotel = suiteState(states, "leg-hotel")
    expect(hotel.selected).toBe(false)
    expect(hotel.units).toHaveLength(1)
    expect(hotel.units[0].id.startsWith("draft-")).toBe(true)
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
  it("keeps manual rows, drops stale package-leg rows, and reindexes sortOrder", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    const transfer = transportState(states, "leg-transfer")
    transfer.selected = true
    transfer.requests[0] = { ...transfer.requests[0], pickupPoint: "Airport", dropoffPoint: "Hotel" }

    const manualRow: BookingTransportRequest = {
      ...transfer.requests[0],
      id: "manual-1",
      packageLegId: null,
      pickupPoint: "Manual pickup",
    }
    const staleOldPackageRow: BookingTransportRequest = {
      ...transfer.requests[0],
      id: "stale-1",
      packageLegId: "leg-of-old-package",
      pickupPoint: "Stale",
    }

    const body = toTransportRequestsPut(states, [manualRow, staleOldPackageRow])
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
})

describe("toApplySelections", () => {
  it("sends units for suite legs and a fallback vehicle category for transport legs", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null, totalsBySupplierId: totals })
    const train = suiteState(states, "leg-train")
    train.units[0].suiteTypeId = "suite-1"
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
        suiteTypeId: "suite-1",
        bedroomTypeId: null,
        bedroomLayoutId: null,
        bathroomTypeId: null,
        adultCount: 2,
        childCount: 1,
        infantCount: 0,
      },
    ])
    expect(trainSel?.commissionOverride).toEqual({ type: "percent", value: 10 })
    expect(trainSel?.nights).toBeUndefined()

    const hotelSel = selections.find((s) => s.legId === "leg-hotel")
    expect(hotelSel).toMatchObject({ routeId: "route-fb", nights: 2 })

    const transferSel = selections.find((s) => s.legId === "leg-transfer")
    expect(transferSel?.suiteTypeId).toBe("vehicle-1")
    expect(transferSel?.units).toBeUndefined()
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

  it("flags missing route, unit type, transport fields, and passenger sum mismatches", () => {
    const states = buildDefaultLegStates(pkg, { tripStartDate: null })
    suiteState(states, "leg-hotel").selected = true
    transportState(states, "leg-transfer").selected = true
    const errors = validateConfigureState(pkg, states, { totalsBySupplierId: totals })
    expect(errors.some((e) => e.includes("meal plan"))).toBe(true) // hotel has 2 routes, none chosen
    expect(errors.some((e) => e.includes("needs a type"))).toBe(true)
    expect(errors.some((e) => e.includes("pickup point"))).toBe(true)
    expect(errors.some((e) => e.includes("vehicle category"))).toBe(true)
    expect(errors.some((e) => e.includes("must sum"))).toBe(true) // split defaulted to 0s
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
})
