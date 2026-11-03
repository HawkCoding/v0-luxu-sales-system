import { describe, expect, it } from "vitest"
import type { BookingTransportRequest, PackageLeg, SupplierKind } from "@/lib/types"
import type { ApplyLegState, SuiteLegState, SuiteUnitState, TransportLegState } from "@/lib/packages/apply-dialog-state"
import { paxGroupNamesFromSuiteTypes } from "@/lib/pax-groups/labels"
import type { PaxGroupDraft } from "@/lib/packages/pax-groups"
import {
  buildPaxGroupViews,
  canExcludeGroupFromLeg,
  collectGroupHeadcountWarnings,
  describeGroupList,
  describeGroupPax,
  describeOverviewCell,
  describeSharedNote,
  describeUnitFittings,
  duplicateGroup,
  excludeGroupFromLeg,
  expectedTotalsForLeg,
  groupProblems,
  includeGroupOnLeg,
  legServesGroup,
  previewGroupRemoval,
  trimRateSplitsToCounts,
  withGroupScope,
} from "@/lib/packages/pax-group-toggles"

function unit(id: string, overrides: Partial<SuiteUnitState> = {}): SuiteUnitState {
  return {
    id,
    suiteTypeId: null,
    bedroomTypeId: null,
    bedroomLayoutId: null,
    bathroomTypeId: null,
    adultCount: 2,
    childCount: 0,
    infantCount: 0,
    manualAdultPrice: null,
    manualChildPrice: null,
    manualInfantPrice: null,
    manualRoomPrice: null,
    complimentaryFirstNight: false,
    manualTourPrice: null,
    fareOverrideAdult: null,
    fareOverrideChild: null,
    fareOverrideInfant: null,
    rateTypeId: null,
    paxGroupIds: [],
    rateSplits: [],
    ...overrides,
  }
}

function suiteLeg(legId: string, supplierKind: SupplierKind, units: SuiteUnitState[], selected = true): SuiteLegState {
  return {
    kind: "suite",
    legId,
    supplierKind,
    selected,
    routeId: "route-1",
    reversed: false,
    serviceDate: "2026-09-01",
    nights: 2,
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
    units,
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
  }
}

function request(id: string, overrides: Partial<BookingTransportRequest> = {}): BookingTransportRequest {
  return {
    id,
    bookingId: "booking-1",
    serviceType: "transfer",
    supplierId: "supplier-transfer",
    routeId: null,
    suiteTypeId: "minibus",
    serviceId: "leg-transfer",
    pickupPoint: "A",
    dropoffPoint: "B",
    pickupAt: null,
    dateAnchor: "custom",
    rentalDetails: null,
    passengerCount: null,
    luggageCount: null,
    flightNumber: null,
    priceOverride: null,
    priceOverrideSetAt: null,
    complimentary: false,
    notes: null,
    supplierReference: "REF-1",
    pricingBasis: "per_person",
    adultCount: 4,
    childCount: 0,
    infantCount: 0,
    priceOverrideChild: null,
    priceOverrideInfant: null,
    paxGroupIds: [],
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }
}

function transportLeg(legId: string, requests: BookingTransportRequest[]): TransportLegState {
  return {
    kind: "transport",
    legId,
    supplierKind: "transfers",
    selected: true,
    routeId: null,
    rateTypeId: null,
    priceCurrency: "ZAR",
    requests,
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
  }
}

function packageLeg(id: string, supplierKind: SupplierKind, overrides: Partial<PackageLeg> = {}): PackageLeg {
  return {
    id,
    packageId: "pkg-1",
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
    sortOrder: 0,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [],
    ...overrides,
  }
}

const TRAIN = "leg-train"
const groups: PaxGroupDraft[] = [
  { id: "g1", label: null },
  { id: "g2", label: "Parents" },
  { id: "g3", label: null },
]
const allIds = groups.map((group) => group.id)

const train = suiteLeg(TRAIN, "train_operator", [
  unit("t1", { paxGroupIds: ["g1"], adultCount: 2, suiteTypeId: "deluxe", bedroomTypeId: "twin" }),
  unit("t2", { paxGroupIds: ["g2"], adultCount: 1, childCount: 1, suiteTypeId: "deluxe" }),
  unit("t3", { paxGroupIds: ["g3"], adultCount: 0, childCount: 2 }),
])

const trainLeg = packageLeg(TRAIN, "train_operator", {
  suiteTypes: [
    {
      id: "deluxe",
      supplierId: "s",
      name: "Deluxe Suite",
      passengerCapacity: 2,
      active: true,
      bedroomTypeIds: ["twin", "double"],
      bedroomTypes: ["Twin", "Double"],
      bathroomTypeIds: ["shower"],
      bathroomTypes: ["Shower"],
      createdAt: "",
      updatedAt: "",
    },
  ],
  rateCards: [
    {
      id: "card-1",
      routeId: "route-1",
      suiteTypeId: "deluxe",
      rateTypeId: "sa",
      pricePerPerson: 100,
      childPrice: null,
      infantPrice: null,
      currency: "ZAR",
      validFrom: "2026-01-01",
      validTo: null,
      createdAt: "",
    },
  ],
})

describe("describeGroupList", () => {
  it("names groups by position, and [] as all of them", () => {
    expect(describeGroupList([], groups)).toBe("All suites")
    expect(describeGroupList(["g2"], groups)).toBe("Suite 2")
    expect(describeGroupList(["g3", "g2"], groups)).toBe("Suites 2 & 3")
    expect(describeGroupList(["g1", "g3"], groups)).toBe("Suites 1 & 3")
    expect(describeGroupList(["g2"], groups, "Room")).toBe("Room 2")
  })

  it("reads a consecutive run of three or more as a range", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }))
    expect(describeGroupList(["g1", "g2", "g3"], groups)).toBe("Suites 1–3")
    expect(describeGroupList(["a", "b", "c", "d", "e"], six)).toBe("Suites 1–5")
    expect(describeGroupList(["b", "c", "d"], six, "Room")).toBe("Rooms 2–4")
    // Two in a row stay a pair.
    expect(describeGroupList(["b", "c"], six)).toBe("Suites 2 & 3")
  })

  it("lists up to four that aren't one run, and counts five or more", () => {
    const six = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }))
    expect(describeGroupList(["a", "b", "d"], six)).toBe("Suites 1, 2 & 4")
    expect(describeGroupList(["a", "b", "c", "e"], six)).toBe("Suites 1, 2, 3 & 5")
    expect(describeGroupList(["a", "b", "c", "d", "f"], six)).toBe("5 suites")
  })
})

describe("describeGroupPax", () => {
  it("drops the kinds nobody is, and says when there is nobody", () => {
    expect(describeGroupPax({ adultCount: 2, childCount: 0, infantCount: 0 })).toBe("2 adults")
    expect(describeGroupPax({ adultCount: 1, childCount: 1, infantCount: 0 })).toBe("1 adult, 1 child")
    expect(describeGroupPax({ adultCount: 0, childCount: 2, infantCount: 0 })).toBe("2 children")
    expect(describeGroupPax({ adultCount: 2, childCount: 0, infantCount: 1 })).toBe("2 adults, 1 infant")
    expect(describeGroupPax({ adultCount: 0, childCount: 0, infantCount: 0 })).toBe("No guests")
  })
})

describe("buildPaxGroupViews", () => {
  const names = paxGroupNamesFromSuiteTypes(trainLeg.suiteTypes)

  it("resolves labels, short labels and headcounts from the primary units", () => {
    const views = buildPaxGroupViews(groups, train, names)
    expect(views.map((view) => [view.position, view.label, view.shortLabel])).toEqual([
      [1, "Twin Deluxe Suite 1", "Twin Deluxe Suite"],
      [2, "Parents", "Parents"],
      [3, "Suite 3", "Not set"],
    ])
    expect(views[1].autoLabel).toBe("Deluxe Suite 2")
    expect(views[2].pax).toEqual({ adultCount: 0, childCount: 2, infantCount: 0 })
  })
})

describe("groupProblems", () => {
  const names = paxGroupNamesFromSuiteTypes(trainLeg.suiteTypes)

  it("blocks a suite with nobody in it, and warns about type, capacity and rate cards", () => {
    const views = buildPaxGroupViews(groups, train, names)
    expect(groupProblems(views[0], trainLeg, train)).toBeNull()
    expect(groupProblems(views[2], trainLeg, train)).toEqual({ level: "warning", reasons: ["no suite type"] })

    const empty = { ...views[0], pax: { adultCount: 0, childCount: 0, infantCount: 0 } }
    expect(groupProblems(empty, trainLeg, train)?.level).toBe("blocking")

    const crowded = buildPaxGroupViews(
      groups,
      { units: [unit("t1", { paxGroupIds: ["g1"], suiteTypeId: "deluxe", adultCount: 3 })] },
      names,
    )[0]
    expect(groupProblems(crowded, trainLeg, train)?.reasons).toContain("more guests than a Deluxe Suite takes")

    const otherRate = buildPaxGroupViews(
      groups,
      { units: [unit("t1", { paxGroupIds: ["g1"], suiteTypeId: "deluxe", rateTypeId: "tw" })] },
      names,
    )[0]
    expect(groupProblems(otherRate, trainLeg, train)?.reasons).toEqual(["a rate with no rate card"])
  })
})

describe("excluding a group from a leg", () => {
  it("takes it off listed units, turns a shared unit into the other groups, and deletes an emptied unit", () => {
    const hotel = suiteLeg("leg-hotel", "hotel_property", [
      unit("h1", { paxGroupIds: ["g1"] }),
      unit("h2", { paxGroupIds: ["g2", "g3"] }),
      unit("h3"),
    ])
    const next = excludeGroupFromLeg(hotel, "g1", allIds)
    expect(next.units.map((u) => [u.id, u.paxGroupIds])).toEqual([
      ["h2", ["g2", "g3"]],
      ["h3", ["g2", "g3"]],
    ])
    expect(legServesGroup(next, "g1")).toBe(false)
  })

  it("never empties a leg", () => {
    const own = suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g1"] })])
    expect(canExcludeGroupFromLeg(own, "g1", allIds)).toBe(false)
    expect(excludeGroupFromLeg(own, "g1", allIds)).toBe(own)
    // Not on it at all: nothing to take off.
    expect(canExcludeGroupFromLeg(own, "g2", allIds)).toBe(false)
  })

  it("works on transport trips", () => {
    const transfer = transportLeg("leg-transfer", [request("r1"), request("r2", { paxGroupIds: ["g2"] })])
    const next = excludeGroupFromLeg(transfer, "g2", allIds)
    expect(next.requests.map((r) => [r.id, r.paxGroupIds])).toEqual([["r1", ["g1", "g3"]]])
  })
})

describe("including a group on a leg", () => {
  const pax = { adultCount: 1, childCount: 1, infantCount: 0 }

  it("gives a hotel suite its own room, copied from the last single-suite room", () => {
    const hotel = suiteLeg("leg-hotel", "hotel_property", [
      unit("h1", { paxGroupIds: ["g1"], suiteTypeId: "classic", manualRoomPrice: 900 }),
      unit("h2", { paxGroupIds: ["g3"], suiteTypeId: "family", manualRoomPrice: 1200, rateSplits: [] }),
    ])
    const result = includeGroupOnLeg(hotel, "g2", allIds, pax)
    expect(result.mode).toBe("own")
    expect(result.itemNumber).toBe(3)
    const added = result.state.units[2]
    expect(added).toMatchObject({ suiteTypeId: "family", manualRoomPrice: 1200, paxGroupIds: ["g2"], adultCount: 1, childCount: 1 })
    expect(added.id).not.toBe("h2")
  })

  it("adds a suite to a trip already shared by 2+ suites", () => {
    const transfer = transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g1", "g3"] })])
    // A fourth suite stays off it, so the trip keeps an explicit list.
    const result = includeGroupOnLeg(transfer, "g2", [...allIds, "g4"], pax)
    expect(result.mode).toBe("shared")
    expect(result.sharedWithIds).toEqual(["g1", "g3"])
    expect(result.state.requests[0].paxGroupIds).toEqual(["g1", "g2", "g3"])
  })

  it("copies a trip for the suite when none is shared", () => {
    const transfer = transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g1"] })])
    const result = includeGroupOnLeg(transfer, "g2", allIds, pax)
    expect(result.mode).toBe("own")
    const added = result.state.requests[1]
    expect(added).toMatchObject({ paxGroupIds: ["g2"], adultCount: 1, childCount: 1, supplierReference: null })
    expect(added.id).not.toBe("r1")
  })

  it("turns a trip back into All suites once every suite is on it again", () => {
    const transfer = transportLeg("leg-transfer", [request("r1")])
    const removed = excludeGroupFromLeg(transfer, "g1", allIds)
    expect(removed.requests[0].paxGroupIds).toEqual(["g2", "g3"])
    const result = includeGroupOnLeg(removed, "g1", allIds, pax)
    expect(result.mode).toBe("shared")
    expect(result.sharedWithIds).toEqual(["g2", "g3"])
    expect(result.state.requests[0].paxGroupIds).toEqual([])
    expect(describeGroupList(result.state.requests[0].paxGroupIds ?? [], groups)).toBe("All suites")
  })

  it("leaves a leg the suite is already on alone", () => {
    const hotel = suiteLeg("leg-hotel", "hotel_property", [unit("h1")])
    expect(includeGroupOnLeg(hotel, "g2", allIds, pax)).toMatchObject({ mode: "unchanged", state: hotel })
  })
})

describe("duplicateGroup", () => {
  it("copies the suite and every service it has alone, and skips the shared ones", () => {
    const states: ApplyLegState[] = [
      train,
      suiteLeg("leg-hotel", "hotel_property", [
        unit("h1", { paxGroupIds: ["g1"], suiteTypeId: "classic" }),
        unit("h2", { paxGroupIds: ["g2", "g3"] }),
      ]),
      suiteLeg("leg-apartment", "hotel_property", [unit("a1", { paxGroupIds: ["g2", "g3"] })]),
      transportLeg("leg-transfer", [request("r1")]),
    ]
    const result = duplicateGroup(states, groups, TRAIN, "g1", "g4")
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.groups.map((group) => group.id)).toEqual(["g1", "g2", "g3", "g4"])
    const trainUnits = (result.states[0] as SuiteLegState).units
    expect(trainUnits).toHaveLength(4)
    expect(trainUnits[3]).toMatchObject({ paxGroupIds: ["g4"], suiteTypeId: "deluxe", bedroomTypeId: "twin", adultCount: 2 })
    const hotelUnits = (result.states[1] as SuiteLegState).units
    expect(hotelUnits.map((u) => u.paxGroupIds)).toEqual([["g1"], ["g2", "g3"], ["g4"]])
    expect(hotelUnits[2].suiteTypeId).toBe("classic")
    // The transfer is shared: it already covers the copy.
    expect(result.states[3]).toBe(states[3])
    expect(result.skipped).toEqual([])
  })

  it("reports the legs the copy is not on because the source shares them", () => {
    const states: ApplyLegState[] = [
      train,
      suiteLeg("leg-apartment", "hotel_property", [
        unit("a1", { paxGroupIds: ["g2", "g3"] }),
        unit("a2", { paxGroupIds: ["g1"] }),
      ]),
    ]
    const result = duplicateGroup(states, groups, TRAIN, "g2", "g4")
    expect(result?.skipped).toEqual([{ legId: "leg-apartment", sharedWithIds: ["g3"] }])
  })
})

describe("previewGroupRemoval", () => {
  it("lists the legs whose own services go, and the ones that keep a shared unit", () => {
    const states: ApplyLegState[] = [
      train,
      suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g1"] }), unit("h2", { paxGroupIds: ["g2"] })]),
      suiteLeg("leg-flight", "airline", [unit("f1", { paxGroupIds: ["g1"] })]),
      transportLeg("leg-transfer", [request("r1")]),
    ]
    expect(previewGroupRemoval(states, TRAIN, "g1")).toEqual({
      ownLegIds: ["leg-hotel"],
      ownItems: [{ legId: "leg-hotel", noun: "Room", number: 1 }],
      keptSharedLegIds: ["leg-flight"],
    })
  })

  it("names only the cards that go, by their number on the leg", () => {
    const states: ApplyLegState[] = [
      train,
      suiteLeg("leg-hotel", "hotel_property", [
        unit("h1", { paxGroupIds: ["g2"] }),
        unit("h2", { paxGroupIds: ["g3"] }),
        unit("h3", { paxGroupIds: ["g2", "g3"] }),
        unit("h4", { paxGroupIds: ["g1"] }),
      ]),
      transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g2", "g3"] }), request("r2", { paxGroupIds: ["g1"] })]),
      // Every trip is Suite 1's: the first stays, shared; only the second goes.
      { ...transportLeg("leg-rental", [request("v1", { paxGroupIds: ["g1"] }), request("v2", { paxGroupIds: ["g1"] })]), supplierKind: "vehicle_rental" },
      // Shared by everyone: nothing goes.
      transportLeg("leg-shuttle", [request("s1")]),
    ]
    expect(previewGroupRemoval(states, TRAIN, "g1")).toEqual({
      ownLegIds: ["leg-hotel", "leg-transfer", "leg-rental"],
      ownItems: [
        { legId: "leg-hotel", noun: "Room", number: 4 },
        { legId: "leg-transfer", noun: "Transfer", number: 2 },
        { legId: "leg-rental", noun: "Vehicle", number: 2 },
      ],
      keptSharedLegIds: ["leg-rental"],
    })
  })
})

describe("expectedTotalsForLeg", () => {
  const booking = { adultCount: 3, childCount: 3, infantCount: 0 }

  it("sums the suites on a leg some suites dropped", () => {
    const hotel = suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g2", "g3"] })])
    expect(expectedTotalsForLeg(hotel, groups, train, booking)).toEqual({ adultCount: 1, childCount: 3, infantCount: 0 })
  })

  it("keeps the booking's totals for a leg every suite is on, the primary leg and a booking without groups", () => {
    const shared = suiteLeg("leg-hotel", "hotel_property", [unit("h1")])
    expect(expectedTotalsForLeg(shared, groups, train, booking)).toBe(booking)
    expect(expectedTotalsForLeg(train, groups, train, booking)).toBe(booking)
    expect(expectedTotalsForLeg(shared, [], train, booking)).toBe(booking)
  })
})

describe("collectGroupHeadcountWarnings", () => {
  it("checks a leg against its suites and names them, and lists a grouped unit off its suites' sum", () => {
    const states: ApplyLegState[] = [
      train,
      // Suites 2 & 3 hold 1 adult, 3 children; this apartment holds 4 adults.
      suiteLeg("leg-apartment", "hotel_property", [unit("a1", { paxGroupIds: ["g2", "g3"], adultCount: 4 })]),
      // Suite 1 only, 2 adults -- matches.
      suiteLeg("leg-flight", "airline", [unit("f1", { paxGroupIds: ["g1"], adultCount: 2 })]),
      // Shared by everyone, against the booking.
      suiteLeg("leg-hotel", "hotel_property", [unit("h1", { adultCount: 5 })]),
    ]
    const detail = {
      legs: [
        packageLeg(TRAIN, "train_operator", { sortOrder: 0 }),
        packageLeg("leg-apartment", "hotel_property", { sortOrder: 1, label: "Family Apartment" }),
        packageLeg("leg-flight", "airline", { sortOrder: 2 }),
        packageLeg("leg-hotel", "hotel_property", { sortOrder: 3, label: "12 Apostles" }),
      ],
    }
    const warnings = collectGroupHeadcountWarnings(
      detail,
      states,
      { "supplier-leg-hotel": { adultCount: 3, childCount: 3, infantCount: 0 } },
      groups,
      TRAIN,
    )
    expect(warnings.map((warning) => [warning.legLabel, warning.message])).toEqual([
      ["12 Apostles (All suites)", "5 on this stay · booking has 6"],
      ["Family Apartment (Suites 2 & 3)", "room 1 holds 4 guests; Suites 2 & 3 have 4."],
    ])
  })
})

describe("withGroupScope", () => {
  it("puts the suites after the leg's name", () => {
    const hotel = suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g3"] })])
    expect(withGroupScope("12 Apostles: select a meal plan", "12 Apostles", hotel, groups)).toBe(
      "12 Apostles (Suite 3): select a meal plan",
    )
    expect(withGroupScope("select a meal plan", "12 Apostles", suiteLeg("x", "hotel_property", [unit("h")]), groups)).toBe(
      "(All suites) select a meal plan",
    )
  })
})

describe("trimRateSplitsToCounts", () => {
  it("drops split guests from the end once the counts fall below them", () => {
    const split = unit("t1", {
      adultCount: 1,
      rateSplits: [
        { rateTypeId: "tw", adultCount: 1, childCount: 0, infantCount: 0 },
        { rateTypeId: "us", adultCount: 1, childCount: 0, infantCount: 0 },
      ],
    })
    expect(trimRateSplitsToCounts(split).rateSplits).toEqual([{ rateTypeId: "tw", adultCount: 1, childCount: 0, infantCount: 0 }])
    const fits = unit("t2", { rateSplits: [{ rateTypeId: "tw", adultCount: 1, childCount: 0, infantCount: 0 }] })
    expect(trimRateSplitsToCounts(fits)).toBe(fits)
  })
})

describe("overview cells", () => {
  const hotelLeg = packageLeg("leg-hotel", "hotel_property", {
    suiteTypes: [
      { id: "classic", supplierId: "s", name: "Classic Room", active: true, createdAt: "", updatedAt: "" },
      { id: "family", supplierId: "s", name: "Family Apartment", active: true, createdAt: "", updatedAt: "" },
    ],
  })

  it("describes the primary suite's fittings as text", () => {
    expect(describeOverviewCell(train, trainLeg, "g1", groups, TRAIN)).toMatchObject({
      kind: "primary",
      line1: "Deluxe Suite · Twin",
    })
    expect(describeUnitFittings({ suiteTypeId: null, bedroomTypeId: null, bathroomTypeId: null }, trainLeg)).toBe("Not set")
  })

  it("says who shares a room, and locks the last suite on a leg", () => {
    const hotel = suiteLeg("leg-hotel", "hotel_property", [
      unit("h1", { paxGroupIds: ["g2", "g3"], suiteTypeId: "family" }),
    ])
    expect(describeOverviewCell(hotel, hotelLeg, "g2", groups, TRAIN)).toMatchObject({
      checked: true,
      line1: "Family Apartment",
      line2: "Suites 2 & 3",
      disabledReason: null,
    })
    expect(describeOverviewCell(hotel, hotelLeg, "g1", groups, TRAIN)).toMatchObject({
      checked: false,
      line1: "Not included",
    })
    const own = suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g2"], suiteTypeId: "classic" })])
    expect(describeOverviewCell(own, hotelLeg, "g2", groups, TRAIN)).toMatchObject({ lastOnLeg: true, line2: null })
  })

  it("counts several rooms, and disables a leg that isn't in the quote", () => {
    const hotel = suiteLeg(
      "leg-hotel",
      "hotel_property",
      [unit("h1", { suiteTypeId: "classic" }), unit("h2", { paxGroupIds: ["g1"], suiteTypeId: "family" })],
      false,
    )
    expect(describeOverviewCell(hotel, hotelLeg, "g1", groups, TRAIN)).toMatchObject({
      line1: "2 rooms",
      line2: "Classic Room, Family Apartment",
      disabledReason: "Tick 'Include in quote & voucher' on this service first.",
    })
  })
})

describe("describeSharedNote", () => {
  it("names the other suites, or every suite for a shared unit", () => {
    expect(describeSharedNote(["g2", "g3"], "g2", groups)).toBe("Shared with Suite 3 — changes apply to both.")
    expect(describeSharedNote(["g1", "g2", "g3"], "g2", groups)).toBe(
      "Shared with Suites 1 & 3 — changes apply to all of them.",
    )
    expect(describeSharedNote([], "g2", groups, "Suite", true)).toBe(
      "Shared by every suite — changes apply to all. Its price is split per guest across these suites on the quote.",
    )
    expect(describeSharedNote(["g2"], "g2", groups)).toBeNull()
  })
})
