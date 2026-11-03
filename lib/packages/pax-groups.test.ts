import { describe, expect, it } from "vitest"
import type { BookingTransportRequest, SupplierKind, UnitRateSplit } from "@/lib/types"
import type { ApplyLegState, SuiteLegState, SuiteUnitState, TransportLegState } from "@/lib/packages/apply-dialog-state"
import { paxGroupNamesFromSuiteTypes } from "@/lib/pax-groups/labels"
import {
  findGroupPaxMismatches,
  fromSavedPaxGroups,
  groupLabel,
  groupsOnLeg,
  guestRatesOf,
  isPaxGroupMode,
  normaliseRateSplits,
  parseUnitRateSplits,
  paxForGroups,
  primaryLegIdOf,
  rateSplitOverflow,
  rateSplitsFromGuestRates,
  supportsRateSplits,
  syncGroupPax,
  syncPaxGroups,
  toBookingPaxGroups,
  toPaxGroupMetas,
  unitServesGroup,
  type PaxGroupDraft,
} from "@/lib/packages/pax-groups"

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

function suiteLeg(legId: string, supplierKind: SupplierKind, units: SuiteUnitState[]): SuiteLegState {
  return {
    kind: "suite",
    legId,
    supplierKind,
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: "2026-09-01",
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
    suiteTypeId: null,
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
    supplierReference: null,
    pricingBasis: "per_person",
    adultCount: null,
    childCount: null,
    infantCount: null,
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

function suite(states: readonly ApplyLegState[], legId: string): SuiteLegState {
  const state = states.find((candidate) => candidate.legId === legId)
  if (state?.kind !== "suite") throw new Error(`expected suite leg ${legId}`)
  return state
}

function transport(states: readonly ApplyLegState[], legId: string): TransportLegState {
  const state = states.find((candidate) => candidate.legId === legId)
  if (state?.kind !== "transport") throw new Error(`expected transport leg ${legId}`)
  return state
}

/** Deterministic ids for minted groups. */
function idFactory(prefix = "new"): () => string {
  let next = 0
  return () => `${prefix}-${++next}`
}

const TRAIN = "leg-train"

describe("primaryLegIdOf", () => {
  const legs = [
    { id: "leg-hotel", supplierId: "sup-hotel", supplierKind: "hotel_property" as const, sortOrder: 0 },
    { id: "leg-train-2", supplierId: "sup-train", supplierKind: "train_operator" as const, sortOrder: 3 },
    { id: "leg-train-1", supplierId: "sup-train", supplierKind: "train_operator" as const, sortOrder: 1 },
  ]

  it("picks the primary supplier's first leg by sort order", () => {
    expect(primaryLegIdOf(legs, "sup-train")).toBe("leg-train-1")
    expect(primaryLegIdOf(legs, "sup-hotel")).toBe("leg-hotel")
  })

  it("falls back to the first train without a primary supplier, and to nothing without one", () => {
    expect(primaryLegIdOf(legs, null)).toBe("leg-train-1")
    expect(primaryLegIdOf([legs[0]], null)).toBeNull()
    expect(primaryLegIdOf(legs, "sup-missing")).toBeNull()
  })
})

describe("syncPaxGroups", () => {
  it("has no groups, and clears every unit's and trip's, below two main-service units", () => {
    const states: ApplyLegState[] = [
      suiteLeg(TRAIN, "train_operator", [unit("t1", { paxGroupIds: ["g1"], rateSplits: [{ rateTypeId: "tw", adultCount: 1, childCount: 0, infantCount: 0 }] })]),
      suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g1", "g2"] })]),
      transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g2"] })]),
    ]
    const result = syncPaxGroups(states, [{ id: "g1", label: null }, { id: "g2", label: null }], TRAIN)

    expect(result.groups).toEqual([])
    expect(suite(result.states, TRAIN).units[0].paxGroupIds).toEqual([])
    // Rate splits don't depend on groups.
    expect(suite(result.states, TRAIN).units[0].rateSplits).toHaveLength(1)
    expect(suite(result.states, "leg-hotel").units[0].paxGroupIds).toEqual([])
    expect(transport(result.states, "leg-transfer").requests[0].paxGroupIds).toEqual([])
  })

  it("returns the very same objects when there is nothing to change", () => {
    const states: ApplyLegState[] = [suiteLeg(TRAIN, "train_operator", [unit("t1")])]
    const groups: PaxGroupDraft[] = []
    const result = syncPaxGroups(states, groups, TRAIN)
    expect(result.groups).toBe(groups)
    expect(result.states[0]).toBe(states[0])
  })

  it("on first activation mints one group per suite and seeds hotels and cruises with one unit per group", () => {
    const states: ApplyLegState[] = [
      suiteLeg(TRAIN, "train_operator", [unit("t1"), unit("t2"), unit("t3")]),
      suiteLeg("leg-hotel", "hotel_property", [unit("h1"), unit("h2"), unit("h3")]),
      suiteLeg("leg-apartment", "hotel_property", [unit("a1"), unit("a2")]),
      suiteLeg("leg-cruise", "cruise_line", [unit("c1"), unit("c2"), unit("c3")]),
      suiteLeg("leg-flight", "airline", [unit("f1"), unit("f2"), unit("f3")]),
      transportLeg("leg-transfer", [request("r1")]),
    ]
    const result = syncPaxGroups(states, [], TRAIN, { newId: idFactory() })

    expect(result.groups).toEqual([
      { id: "new-1", label: null },
      { id: "new-2", label: null },
      { id: "new-3", label: null },
    ])
    expect(suite(result.states, TRAIN).units.map((u) => u.paxGroupIds)).toEqual([["new-1"], ["new-2"], ["new-3"]])
    expect(suite(result.states, "leg-hotel").units.map((u) => u.paxGroupIds)).toEqual([["new-1"], ["new-2"], ["new-3"]])
    expect(suite(result.states, "leg-cruise").units.map((u) => u.paxGroupIds)).toEqual([["new-1"], ["new-2"], ["new-3"]])
    // Not one unit per group, or not a hotel/cruise: left shared.
    expect(suite(result.states, "leg-apartment").units.map((u) => u.paxGroupIds)).toEqual([[], []])
    expect(suite(result.states, "leg-flight").units.map((u) => u.paxGroupIds)).toEqual([[], [], []])
    expect(transport(result.states, "leg-transfer")).toBe(states[5])
  })

  it("keeps existing groups and labels, and never re-seeds once groups exist", () => {
    const groups: PaxGroupDraft[] = [
      { id: "g1", label: "Parents" },
      { id: "g2", label: null },
    ]
    const states: ApplyLegState[] = [
      suiteLeg(TRAIN, "train_operator", [unit("t1", { paxGroupIds: ["g1"] }), unit("t2", { paxGroupIds: ["g2"] })]),
      // Added after the groups were set up: stays shared until the consultant assigns it.
      suiteLeg("leg-hotel", "hotel_property", [unit("h1"), unit("h2")]),
    ]
    const result = syncPaxGroups(states, groups, TRAIN, { newId: idFactory() })
    expect(result.groups).toBe(groups)
    expect(result.states[0]).toBe(states[0])
    expect(result.states[1]).toBe(states[1])
  })

  it("mints a new group for a duplicated suite that still names its original's group", () => {
    const groups: PaxGroupDraft[] = [
      { id: "g1", label: "Parents" },
      { id: "g2", label: null },
    ]
    const states: ApplyLegState[] = [
      suiteLeg(TRAIN, "train_operator", [
        unit("t1", { paxGroupIds: ["g1"] }),
        unit("t2", { paxGroupIds: ["g2"] }),
        unit("t3", { paxGroupIds: ["g2"] }),
      ]),
    ]
    const result = syncPaxGroups(states, groups, TRAIN, { newId: idFactory() })
    expect(result.groups).toEqual([...groups, { id: "new-1", label: null }])
    expect(suite(result.states, TRAIN).units[2].paxGroupIds).toEqual(["new-1"])
  })

  it("drops a removed suite's group, strips it everywhere and deletes the units and trips it had alone", () => {
    const groups: PaxGroupDraft[] = [
      { id: "g1", label: null },
      { id: "g2", label: "Kids" },
      { id: "g3", label: null },
    ]
    const states: ApplyLegState[] = [
      // Suite 1 was removed; g2 and g3 remain.
      suiteLeg(TRAIN, "train_operator", [unit("t2", { paxGroupIds: ["g2"] }), unit("t3", { paxGroupIds: ["g3"] })]),
      suiteLeg("leg-hotel", "hotel_property", [
        unit("h1", { paxGroupIds: ["g1", "g2"] }),
        unit("h2", { paxGroupIds: ["g1"] }),
        unit("h3", { paxGroupIds: ["g3"] }),
        unit("h4"),
      ]),
      transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g1"] }), request("r2", { paxGroupIds: ["g3"] })]),
    ]
    const result = syncPaxGroups(states, groups, TRAIN)

    expect(result.groups).toEqual([
      { id: "g2", label: "Kids" },
      { id: "g3", label: null },
    ])
    // h2 was Suite 1's own room: it goes. The shared h4 stays shared.
    expect(suite(result.states, "leg-hotel").units.map((u) => u.id)).toEqual(["h1", "h3", "h4"])
    expect(suite(result.states, "leg-hotel").units.map((u) => u.paxGroupIds)).toEqual([["g2"], ["g3"], []])
    expect(transport(result.states, "leg-transfer").requests.map((r) => r.id)).toEqual(["r2"])
    expect(transport(result.states, "leg-transfer").requests.map((r) => r.paxGroupIds)).toEqual([["g3"]])
  })

  it("keeps a removed suite's unit or trip, shared, when it is its leg's last", () => {
    const groups: PaxGroupDraft[] = [
      { id: "g1", label: null },
      { id: "g2", label: null },
      { id: "g3", label: null },
    ]
    const states: ApplyLegState[] = [
      suiteLeg(TRAIN, "train_operator", [unit("t2", { paxGroupIds: ["g2"] }), unit("t3", { paxGroupIds: ["g3"] })]),
      suiteLeg("leg-flight", "airline", [unit("f1", { paxGroupIds: ["g1"] }), unit("f2", { paxGroupIds: ["g1"] })]),
      transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g1"] })]),
    ]
    const result = syncPaxGroups(states, groups, TRAIN)

    expect(suite(result.states, "leg-flight").units.map((u) => u.id)).toEqual(["f1"])
    expect(suite(result.states, "leg-flight").units[0].paxGroupIds).toEqual([])
    expect(transport(result.states, "leg-transfer").requests.map((r) => [r.id, r.paxGroupIds])).toEqual([["r1", []]])
  })

  it("deletes a removed suite's own units when the booking drops out of group mode", () => {
    const groups: PaxGroupDraft[] = [
      { id: "g1", label: "Parents" },
      { id: "g2", label: null },
    ]
    const states: ApplyLegState[] = [
      // Suite 2 was removed; Suite 1 is the only one left.
      suiteLeg(TRAIN, "train_operator", [unit("t1", { paxGroupIds: ["g1"] })]),
      suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g1"] }), unit("h2", { paxGroupIds: ["g2"] })]),
    ]
    const result = syncPaxGroups(states, groups, TRAIN)

    expect(result.groups).toEqual([])
    expect(suite(result.states, TRAIN).units[0].paxGroupIds).toEqual([])
    expect(suite(result.states, "leg-hotel").units.map((u) => [u.id, u.paxGroupIds])).toEqual([["h1", []]])
  })

  it("keeps an id a hydrated suite already names even when the group list wasn't passed", () => {
    const states: ApplyLegState[] = [
      suiteLeg(TRAIN, "train_operator", [unit("t1", { paxGroupIds: ["saved-1"] }), unit("t2", { paxGroupIds: ["saved-2"] })]),
    ]
    const result = syncPaxGroups(states, [], TRAIN, { newId: idFactory() })
    expect(result.groups.map((group) => group.id)).toEqual(["saved-1", "saved-2"])
  })

  it("does nothing to groups when the primary leg isn't found", () => {
    const states: ApplyLegState[] = [suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g1"] })])]
    const result = syncPaxGroups(states, [{ id: "g1", label: null }], null)
    expect(result.groups).toEqual([])
    expect(suite(result.states, "leg-hotel").units[0].paxGroupIds).toEqual([])
  })
})

describe("syncGroupPax", () => {
  const groups: PaxGroupDraft[] = [
    { id: "g1", label: null },
    { id: "g2", label: null },
  ]

  function groupedStates(): ApplyLegState[] {
    return [
      suiteLeg(TRAIN, "train_operator", [
        unit("t1", { paxGroupIds: ["g1"], adultCount: 2, childCount: 0 }),
        unit("t2", { paxGroupIds: ["g2"], adultCount: 0, childCount: 2, infantCount: 1 }),
      ]),
      suiteLeg("leg-hotel", "hotel_property", [
        unit("apartment", { paxGroupIds: ["g1", "g2"], adultCount: 1, childCount: 0 }),
        unit("shared", { paxGroupIds: [], adultCount: 7 }),
      ]),
      transportLeg("leg-transfer", [
        request("per-person", { paxGroupIds: ["g2"] }),
        request("per-vehicle", { paxGroupIds: ["g2"], pricingBasis: "per_vehicle", passengerCount: 9 }),
      ]),
    ]
  }

  it("sets a grouped unit's and per-person trip's counts to its groups' suites", () => {
    const result = syncGroupPax(groupedStates(), groups, TRAIN)
    expect(suite(result, "leg-hotel").units[0]).toMatchObject({ adultCount: 2, childCount: 2, infantCount: 1 })
    // Shared units keep their own counts.
    expect(suite(result, "leg-hotel").units[1].adultCount).toBe(7)
    expect(transport(result, "leg-transfer").requests[0]).toMatchObject({ adultCount: 0, childCount: 2, infantCount: 1 })
    expect(transport(result, "leg-transfer").requests[1]).toMatchObject({ adultCount: null, passengerCount: 9 })
  })

  it("is a no-op outside group mode", () => {
    const states = groupedStates()
    expect(syncGroupPax(states, [], TRAIN)).toBe(states)
  })

  it("with the previous states, leaves a hand-edited count alone until its groups change", () => {
    const synced = syncGroupPax(groupedStates(), groups, TRAIN)
    // The consultant types 5 adults into the apartment by hand.
    const edited = synced.map((state) =>
      state.legId === "leg-hotel" && state.kind === "suite"
        ? { ...state, units: [{ ...state.units[0], adultCount: 5 }, state.units[1]] }
        : state,
    )
    expect(suite(syncGroupPax(edited, groups, TRAIN, synced), "leg-hotel").units[0].adultCount).toBe(5)

    // Suite 1 gains an adult: the apartment re-syncs to 3 + 0.
    const grown = edited.map((state) =>
      state.legId === TRAIN && state.kind === "suite"
        ? { ...state, units: [{ ...state.units[0], adultCount: 3 }, state.units[1]] }
        : state,
    )
    expect(suite(syncGroupPax(grown, groups, TRAIN, edited), "leg-hotel").units[0].adultCount).toBe(3)

    // The apartment now serves suite 2 only: re-synced to suite 2's guests.
    const narrowed = grown.map((state) =>
      state.legId === "leg-hotel" && state.kind === "suite"
        ? { ...state, units: [{ ...state.units[0], adultCount: 5, paxGroupIds: ["g2"] }, state.units[1]] }
        : state,
    )
    expect(suite(syncGroupPax(narrowed, groups, TRAIN, grown), "leg-hotel").units[0]).toMatchObject({
      adultCount: 0,
      childCount: 2,
      infantCount: 1,
    })
  })

  it("reports grouped units and per-person trips whose counts differ from their suites", () => {
    const states = groupedStates()
    expect(findGroupPaxMismatches(states, groups, TRAIN)).toEqual([
      {
        legId: "leg-hotel",
        unitId: "apartment",
        expected: { adultCount: 2, childCount: 2, infantCount: 1 },
        actual: { adultCount: 1, childCount: 0, infantCount: 0 },
      },
      {
        legId: "leg-transfer",
        requestId: "per-person",
        expected: { adultCount: 0, childCount: 2, infantCount: 1 },
        actual: { adultCount: 0, childCount: 0, infantCount: 0 },
      },
    ])
    expect(findGroupPaxMismatches(syncGroupPax(states, groups, TRAIN), groups, TRAIN)).toEqual([])
  })
})

describe("group queries", () => {
  const groups: PaxGroupDraft[] = [
    { id: "g1", label: null },
    { id: "g2", label: null },
    { id: "g3", label: null },
  ]
  const states: ApplyLegState[] = [
    suiteLeg(TRAIN, "train_operator", [
      unit("t1", { paxGroupIds: ["g1"], adultCount: 2 }),
      unit("t2", { paxGroupIds: ["g2"], adultCount: 1, childCount: 1 }),
      unit("t3", { paxGroupIds: ["g3"], adultCount: 0, childCount: 2 }),
    ]),
    suiteLeg("leg-hotel", "hotel_property", [unit("h1", { paxGroupIds: ["g3", "g1"] })]),
    suiteLeg("leg-safari", "tour_operator", [unit("s1", { paxGroupIds: ["g2"] }), unit("s2")]),
    suiteLeg("leg-empty", "tour_operator", []),
    transportLeg("leg-transfer", [request("r1", { paxGroupIds: ["g2"] })]),
  ]

  it("knows group mode and which groups each leg carries, in group order", () => {
    expect(isPaxGroupMode(states, TRAIN)).toBe(true)
    expect(isPaxGroupMode(states, "leg-hotel")).toBe(false)
    expect(groupsOnLeg(suite(states, TRAIN), groups)).toEqual(["g1", "g2", "g3"])
    expect(groupsOnLeg(suite(states, "leg-hotel"), groups)).toEqual(["g1", "g3"])
    // A shared unit puts every group on the leg.
    expect(groupsOnLeg(suite(states, "leg-safari"), groups)).toEqual(["g1", "g2", "g3"])
    expect(groupsOnLeg(suite(states, "leg-empty"), groups)).toEqual([])
    expect(groupsOnLeg(transport(states, "leg-transfer"), groups)).toEqual(["g2"])
  })

  it("says whether a unit serves a group", () => {
    expect(unitServesGroup({ paxGroupIds: [] }, "g1")).toBe(true)
    expect(unitServesGroup({ paxGroupIds: ["g2"] }, "g1")).toBe(false)
  })

  it("sums the given groups' suites", () => {
    expect(paxForGroups(states, TRAIN, ["g2", "g3", "unknown"])).toEqual({ adultCount: 1, childCount: 3, infantCount: 0 })
  })
})

describe("group names", () => {
  const names = paxGroupNamesFromSuiteTypes([
    { id: "deluxe", name: "Deluxe Suite", bedroomTypeIds: ["twin", "double"], bedroomTypes: ["Twin", "Double"] },
  ])

  it("uses the typed label, else the shared automatic name", () => {
    expect(groupLabel({ label: " Honeymoon ", position: 1 }, null, names)).toBe("Honeymoon")
    expect(groupLabel({ label: null, position: 2 }, { suiteTypeId: "deluxe", bedroomTypeId: "twin" }, names)).toBe(
      "Twin Deluxe Suite 2",
    )
    // No suite type name: "Suite <n>", even with a bedroom type (lib/pax-groups/labels.ts).
    expect(groupLabel({ label: null, position: 3 }, { suiteTypeId: null, bedroomTypeId: "twin" }, names)).toBe("Suite 3")
  })

  it("resolves the dialog's groups for the apply body, positions in list order", () => {
    const primary = suiteLeg(TRAIN, "train_operator", [
      unit("t1", { paxGroupIds: ["g1"], suiteTypeId: "deluxe", bedroomTypeId: "double" }),
      unit("t2", { paxGroupIds: ["g2"], suiteTypeId: "deluxe", bedroomTypeId: "twin" }),
    ])
    expect(
      toPaxGroupMetas(
        [
          { id: "g1", label: null },
          { id: "g2", label: "Kids" },
        ],
        primary,
        names,
      ),
    ).toEqual([
      { id: "g1", position: 1, label: "Double Deluxe Suite 1" },
      { id: "g2", position: 2, label: "Kids" },
    ])
  })

  it("converts between the dialog's list and stored rows", () => {
    const drafts: PaxGroupDraft[] = [
      { id: "g1", label: null },
      { id: "g2", label: "Kids" },
    ]
    expect(toBookingPaxGroups(drafts)).toEqual([
      { id: "g1", position: 1, label: null },
      { id: "g2", position: 2, label: "Kids" },
    ])
    expect(
      fromSavedPaxGroups([
        { id: "g2", position: 2, label: "  " },
        { id: "g1", position: 1, label: "Parents" },
      ]),
    ).toEqual([
      { id: "g1", label: "Parents" },
      { id: "g2", label: null },
    ])
    expect(fromSavedPaxGroups(undefined)).toEqual([])
  })
})

describe("rate splits", () => {
  const tw = (adultCount: number, childCount = 0, infantCount = 0): UnitRateSplit => ({
    rateTypeId: "tw",
    adultCount,
    childCount,
    infantCount,
  })

  it("applies to rate-card trains, tours and cruises only", () => {
    expect(supportsRateSplits("train_operator")).toBe(true)
    expect(supportsRateSplits("tour_operator", "rate_card")).toBe(true)
    expect(supportsRateSplits("cruise_line")).toBe(true)
    expect(supportsRateSplits("train_operator", "manual")).toBe(false)
    expect(supportsRateSplits("hotel_property")).toBe(false)
    expect(supportsRateSplits("airline")).toBe(false)
    expect(supportsRateSplits(null)).toBe(false)
  })

  it("parses stored splits, dropping malformed entries", () => {
    expect(
      parseUnitRateSplits([
        { rateTypeId: "tw", adultCount: 1 },
        { rateTypeId: "sa", adultCount: -1 },
        { rateTypeId: "sa", adultCount: 1.5 },
        { adultCount: 1 },
        null,
      ]),
    ).toEqual([tw(1)])
    expect(parseUnitRateSplits("nope")).toEqual([])
  })

  it("merges splits on one rate, drops empty ones and ones on the unit's own rate", () => {
    expect(
      normaliseRateSplits(
        [tw(1), { rateTypeId: "sa", adultCount: 1, childCount: 0, infantCount: 0 }, tw(0, 1), tw(0)],
        "sa",
      ),
    ).toEqual([tw(1, 1)])
    expect(normaliseRateSplits([tw(0)], null)).toEqual([])
  })

  it("finds the first kind with more split guests than the unit holds", () => {
    const suiteUnit = { adultCount: 2, childCount: 1, infantCount: 0 }
    expect(rateSplitOverflow(suiteUnit, [tw(2, 1)])).toBeNull()
    expect(rateSplitOverflow(suiteUnit, [tw(1), tw(2)])).toBe("adult")
    expect(rateSplitOverflow(suiteUnit, [tw(0, 2)])).toBe("child")
    expect(rateSplitOverflow(suiteUnit, [tw(0, 0, 1)])).toBe("infant")
  })

  it("expands a unit into per-guest rate rows and collapses them back", () => {
    const suiteUnit = { adultCount: 2, childCount: 1, infantCount: 0, rateSplits: [tw(1)] }
    const guests = guestRatesOf(suiteUnit)
    expect(guests).toEqual([
      { kind: "adult", rateTypeId: null },
      { kind: "adult", rateTypeId: "tw" },
      { kind: "child", rateTypeId: null },
    ])
    expect(rateSplitsFromGuestRates(guests, "sa")).toEqual([tw(1)])

    // Picking the unit's own rate for a guest is the same as leaving it on the unit's rate.
    const changed = guests.map((guest, index) => (index === 2 ? { ...guest, rateTypeId: "tw" } : index === 1 ? { ...guest, rateTypeId: "sa" } : guest))
    expect(rateSplitsFromGuestRates(changed, "sa")).toEqual([tw(0, 1)])
  })

  it("cuts off split guests beyond the unit's count", () => {
    expect(guestRatesOf({ adultCount: 1, childCount: 0, infantCount: 0, rateSplits: [tw(3)] })).toEqual([
      { kind: "adult", rateTypeId: "tw" },
    ])
  })
})
