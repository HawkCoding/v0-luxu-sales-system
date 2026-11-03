import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { PaxGroupOverview } from "./pax-group-overview"
import { LegNotInGroupRow } from "./leg-not-in-group-row"
import type { PackageLeg, SupplierKind } from "@/lib/types"
import type { SuiteLegState, SuiteUnitState } from "@/lib/packages/apply-dialog-state"
import type { PaxGroupView } from "@/lib/packages/pax-group-toggles"

function unit(id: string, paxGroupIds: string[], suiteTypeId: string | null = null): SuiteUnitState {
  return {
    id,
    suiteTypeId,
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
    paxGroupIds,
    rateSplits: [],
  }
}

function state(legId: string, supplierKind: SupplierKind, units: SuiteUnitState[], selected = true): SuiteLegState {
  return {
    kind: "suite",
    legId,
    supplierKind,
    selected,
    routeId: null,
    reversed: false,
    serviceDate: "2026-09-01",
    nights: 1,
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

function leg(id: string, supplierKind: SupplierKind, name: string, sortOrder: number): PackageLeg {
  return {
    id,
    packageId: "pkg",
    supplierId: `s-${id}`,
    supplierName: name,
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
    suiteTypes: [
      { id: "deluxe", supplierId: "s", name: "Deluxe Suite", active: true, createdAt: "", updatedAt: "" },
      { id: "family", supplierId: "s", name: "Family Apartment", active: true, createdAt: "", updatedAt: "" },
    ],
  }
}

function view(id: string, position: number, adults: number): PaxGroupView {
  return {
    id,
    position,
    typedLabel: null,
    autoLabel: `Deluxe Suite ${position}`,
    label: `Deluxe Suite ${position}`,
    shortLabel: "Deluxe Suite",
    pax: { adultCount: adults, childCount: 0, infantCount: 0 },
    primaryUnit: null,
  }
}

const legs = [
  leg("train", "train_operator", "Rovos Rail", 0),
  leg("hotel", "hotel_property", "12 Apostles", 1),
  leg("spa", "hotel_property", "Apogee Spa", 2),
]
const legStates = [
  state("train", "train_operator", [unit("t1", ["g1"], "deluxe"), unit("t2", ["g2"], "deluxe")]),
  state("hotel", "hotel_property", [unit("h1", ["g1", "g2"], "family")]),
  state("spa", "hotel_property", [unit("a1", ["g1"], "family")], false),
]
const groups = [view("g1", 1, 2), view("g2", 2, 0)]

describe("PaxGroupOverview", () => {
  function setup() {
    const onToggle = vi.fn()
    const onSelectGroup = vi.fn()
    render(
      <PaxGroupOverview
        legs={legs}
        legStates={legStates}
        groups={groups}
        problems={new Map([["g2", { level: "blocking", reasons: ["no guests in this suite"] }]])}
        primaryLegId="train"
        noun="Suite"
        onSelectGroup={onSelectGroup}
        onToggle={onToggle}
      />,
    )
    return { onToggle, onSelectGroup }
  }

  it("is a real table: services as rows, suites as columns, with a caption", () => {
    setup()
    expect(screen.getByRole("table", { name: /Which suite is on which service/ })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: /Service/ })).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: /Rovos Rail Train · main product/ })).toBeInTheDocument()
    expect(screen.getByRole("rowheader", { name: /Apogee Spa Not in quote/ })).toBeInTheDocument()
    expect(screen.getAllByText("No guests").length).toBeGreaterThan(0)
  })

  it("says who shares a room and toggles a suite off a service", () => {
    const { onToggle } = setup()
    // The same words in every column it serves, so the cells don't need subtracting.
    expect(screen.getAllByText("Suites 1 & 2")).toHaveLength(2)
    fireEvent.click(screen.getByRole("checkbox", { name: "Suite 1 on 12 Apostles" }))
    expect(onToggle).toHaveBeenCalledWith("hotel", "g1", false)
  })

  it("disables every box on a service not in the quote", () => {
    setup()
    expect(screen.getByRole("checkbox", { name: "Suite 1 on Apogee Spa" })).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: "Suite 2 on Apogee Spa" })).toBeDisabled()
  })

  it("shows the caption above the scroller and a swipe hint for phones", () => {
    setup()
    const caption = document.getElementById("pax-overview-caption")
    expect(caption).toHaveTextContent("Which suite is on which service.")
    expect(caption?.closest(".overflow-x-auto")).toBeNull()
    // Two suites fit on a desktop: the hint is for phones only.
    expect(screen.getByText("Swipe sideways to see every suite.")).toHaveClass("md:hidden")
  })

  it("wraps a cell's second line instead of truncating it", () => {
    setup()
    expect(screen.getAllByText("Suites 1 & 2")[0]).not.toHaveClass("truncate")
  })

  it("selects a suite's tab from its column", () => {
    const { onSelectGroup } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Suite 2" }))
    expect(onSelectGroup).toHaveBeenCalledWith("g2")
  })
})

describe("LegNotInGroupRow", () => {
  it("names the service and offers to add it back to the suite", () => {
    const onAddBack = vi.fn()
    render(<LegNotInGroupRow legId="spa" legName="Apogee Spa" noun="Suite" position={2} onAddBack={onAddBack} />)
    expect(screen.getByText(/not in this suite/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add Apogee Spa back to Suite 2" }))
    expect(onAddBack).toHaveBeenCalled()
  })
})
