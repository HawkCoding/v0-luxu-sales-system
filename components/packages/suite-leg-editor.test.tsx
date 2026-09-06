import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SuiteLegEditor } from "./suite-leg-editor"
import type { HotelAnchorContext, SuiteLegState, TransferAnchorContext } from "@/lib/packages/apply-dialog-state"
import type { PackageLeg } from "@/lib/types"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"

const leg: PackageLeg = {
  id: "leg-1",
  packageId: "pkg-1",
  supplierId: "supplier-1",
  supplierName: "The Blue Train",
  supplierDescription: null,
  supplierKind: "train_operator",
  pricingMode: "rate_card",
  transferPricingBasis: "per_vehicle",
  accommodationPricingBasis: "per_person",
  baseRateTypeId: null,
  quoteRateTypeId: null,
  inheritedRateTypeName: null,
  applicableRateTypeIds: null,
  label: "The Blue Train",
  sortOrder: 0,
  dateAnchor: null,
  routes: [],
  rateCards: [],
  suiteTypes: [],
}

/** Airline-only fields, empty on every non-flight leg. */
const noFlightSchedule = {
  departureTime: null,
  arrivalDate: null,
  arrivalTime: null,
  flightNumber: null,
  departureAirportCode: null,
  arrivalAirportCode: null,
  handLuggageKg: null,
  checkedLuggageKg: null,
} satisfies Partial<SuiteLegState>

function makeLegState(units: SuiteLegState["units"]): SuiteLegState {
  return {
    kind: "suite",
    legId: "leg-1",
    supplierKind: "train_operator",
    accommodationPricingBasis: "per_person",
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: "2026-09-24",
    nights: null,
    ...noFlightSchedule,
    dateAnchor: null,
    notes: null,
    luggageStorageAvailable: false,
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

const mismatchedUnits: SuiteLegState["units"] = [
  {
    id: "unit-1",
    suiteTypeId: null,
    bedroomTypeId: null,
    bedroomLayoutId: null,
    bathroomTypeId: null,
    adultCount: 7,
    childCount: 1,
    infantCount: 0,
    manualAdultPrice: null,
    manualChildPrice: null,
    manualInfantPrice: null,
    manualRoomPrice: null,
    complimentaryFirstNight: false,
    manualTourPrice: null,
    rateTypeId: null,
  },
]

const expectedTotals: PassengerTotals = { adultCount: 2, childCount: 1, infantCount: 0 }

describe("SuiteLegEditor passenger split chip", () => {
  it("renders the summed/expected chip in destructive style when they mismatch", () => {
    render(
      <SuiteLegEditor
        leg={leg}
        value={makeLegState(mismatchedUnits)}
        onChange={vi.fn()}
        expectedTotals={expectedTotals}
      />,
    )
    expect(screen.getByText(/7\/2 adults/)).toBeInTheDocument()
  })

  it("offers Spread evenly on mismatch, which re-seeds units from the booking totals", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={leg}
        value={makeLegState(mismatchedUnits)}
        onChange={onChange}
        expectedTotals={expectedTotals}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /spread evenly/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [expect.objectContaining({ adultCount: 2, childCount: 1, infantCount: 0 })],
      }),
    )
  })

  it("hides Spread evenly once the split matches the booking totals", () => {
    render(
      <SuiteLegEditor
        leg={leg}
        value={makeLegState([{ ...mismatchedUnits[0], adultCount: 2 }])}
        onChange={vi.fn()}
        expectedTotals={expectedTotals}
      />,
    )
    expect(screen.queryByRole("button", { name: /spread evenly/i })).not.toBeInTheDocument()
  })
})

const hotelLeg: PackageLeg = {
  ...leg,
  id: "leg-hotel",
  supplierId: "supplier-hotel",
  supplierName: "Table Bay Hotel",
  supplierKind: "hotel_property",
  label: "Table Bay Hotel",
  baseRateTypeId: "rate-1",
  dateAnchor: "pre",
  routes: [
    {
      id: "route-1",
      supplierId: "supplier-hotel",
      name: "Bed & breakfast",
      originLocationId: null,
      destinationLocationId: null,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  suiteTypes: [
    {
      id: "suite-1",
      supplierId: "supplier-hotel",
      name: "Luxury Room",
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  rateCards: [
    {
      id: "card-1",
      routeId: "route-1",
      suiteTypeId: "suite-1",
      rateTypeId: "rate-1",
      pricePerPerson: 4250,
      childPrice: null,
      infantPrice: null,
      currency: "ZAR",
      validFrom: "2026-01-01",
      validTo: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
}

function makeHotelState(overrides: Partial<SuiteLegState["units"][number]> = {}): SuiteLegState {
  return {
    kind: "suite",
    legId: "leg-hotel",
    supplierKind: "hotel_property",
    accommodationPricingBasis: "per_person",
    selected: true,
    routeId: "route-1",
    reversed: false,
    serviceDate: "2026-09-24",
    nights: 3,
    ...noFlightSchedule,
    dateAnchor: "custom",
    notes: null,
    luggageStorageAvailable: false,
    rateTypeId: null,
    priceCurrency: "ZAR",
    units: [{ ...mismatchedUnits[0], suiteTypeId: "suite-1", adultCount: 2, ...overrides }],
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
  }
}

describe("SuiteLegEditor hotel date anchor", () => {
  it("renders the check-in/check-out anchorContext supplies, not a locally re-derived date", () => {
    // The chained stay (e.g. the second of two consecutive pre-stay hotels) doesn't match what a
    // standalone single-hotel resolve would produce — this proves the editor trusts the context's
    // stayDates rather than recomputing its own from anchorContext.departureDate/durationDays.
    const chainedAnchorContext: HotelAnchorContext = {
      trainLabel: "The Blue Train",
      departureDate: "2026-09-15",
      durationDays: null,
      stayDates: { checkIn: "2026-09-14", checkOut: "2026-09-15" },
    }

    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={{ ...makeHotelState(), dateAnchor: "pre", nights: 1 }}
        onChange={vi.fn()}
        anchorContext={chainedAnchorContext}
      />,
    )

    expect(screen.getByText(/14-09-2026/)).toBeInTheDocument()
    expect(screen.getByText(/15-09-2026/)).toBeInTheDocument()
  })

  it("shows the unresolved-anchor fallback copy when the context has no stayDates yet", () => {
    const unresolvedAnchorContext: HotelAnchorContext = {
      trainLabel: "The Blue Train",
      departureDate: null,
      durationDays: null,
      stayDates: null,
    }

    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={{ ...makeHotelState(), dateAnchor: "pre", nights: 1 }}
        onChange={vi.fn()}
        anchorContext={unresolvedAnchorContext}
      />,
    )

    expect(screen.getByText(/work out this hotel's check-in/i)).toBeInTheDocument()
  })
})

describe("SuiteLegEditor luggage storage", () => {
  it("renders unticked for a hotel leg with no saved flag", () => {
    render(<SuiteLegEditor leg={hotelLeg} value={makeHotelState()} onChange={vi.fn()} />)

    expect(screen.getByLabelText(/luggage storage available at reception/i)).not.toBeChecked()
  })

  it("reflects a saved flag and toggles it via onChange", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={{ ...makeHotelState(), luggageStorageAvailable: true }}
        onChange={onChange}
      />,
    )

    const checkbox = screen.getByLabelText(/luggage storage available at reception/i)
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ luggageStorageAvailable: false }),
    )
  })

  it("is not rendered for a non-hotel leg", () => {
    render(
      <SuiteLegEditor
        leg={leg}
        value={makeLegState(mismatchedUnits)}
        onChange={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText(/luggage storage available at reception/i)).not.toBeInTheDocument()
  })
})

describe("SuiteLegEditor room price override", () => {
  it("stays collapsed on a room with no override, showing the rate card it prices off", () => {
    render(<SuiteLegEditor leg={hotelLeg} value={makeHotelState()} onChange={vi.fn()} />)

    expect(screen.getByText(/rate card/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/price override for room 1/i)).not.toBeInTheDocument()
  })

  it("reveals the field when the consultant asks to override", () => {
    render(<SuiteLegEditor leg={hotelLeg} value={makeHotelState()} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /override price/i }))
    expect(screen.getByLabelText(/price override for room 1/i)).toBeInTheDocument()
  })

  it("opens expanded when the room already carries a saved override", () => {
    render(
      <SuiteLegEditor leg={hotelLeg} value={makeHotelState({ manualRoomPrice: 4500 })} onChange={vi.fn()} />,
    )

    expect(screen.getByLabelText(/price override for room 1/i)).toHaveValue(4500)
    expect(screen.getByText("Overridden")).toBeInTheDocument()
  })

  it("treats a zero price as a real override rather than an empty field", () => {
    // A comped room is priced at 0 — collapsing it would silently re-price the room off the card.
    render(
      <SuiteLegEditor leg={hotelLeg} value={makeHotelState({ manualRoomPrice: 0 })} onChange={vi.fn()} />,
    )

    expect(screen.getByLabelText(/price override for room 1/i)).toBeInTheDocument()
    expect(screen.getByText("Complimentary")).toBeInTheDocument()
  })

  it("clears the override and collapses on Revert", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor leg={hotelLeg} value={makeHotelState({ manualRoomPrice: 4500 })} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole("button", { name: /revert/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [expect.objectContaining({ manualRoomPrice: null })],
      }),
    )
  })

  // The card is R4 250 per person and the room holds two adults, so the room costs R8 500 a night.
  // Quoting the bare card price here told the consultant it cost half that, and the override
  // placeholder invited them to type that halved figure in.
  it("quotes the rate card as what this room costs a night, not as one guest's fare", () => {
    render(<SuiteLegEditor leg={hotelLeg} value={makeHotelState()} onChange={vi.fn()} />)

    expect(screen.getByText(/8[\s,]?500/)).toBeInTheDocument()
    expect(screen.getByText(/per night for this room/i)).toBeInTheDocument()
  })

  it("quotes the card as the room's flat nightly rate when the stay prices per room", () => {
    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={{ ...makeHotelState(), accommodationPricingBasis: "per_room" }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/4[\s,]?250/)).toBeInTheDocument()
    expect(screen.getByText(/per room per night/i)).toBeInTheDocument()
  })

  it("costs a gifted first night off the room's real nightly rate", () => {
    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={makeHotelState({ complimentaryFirstNight: true })}
        onChange={vi.fn()}
      />,
    )

    // Three nights, one gifted, two charged at R8 500 = R17 000 -- not 2 x R4 250.
    expect(screen.getByText(/2 of 3 nights at .*=.*17[\s,]?000/)).toBeInTheDocument()
  })
})

describe("SuiteLegEditor accommodation pricing basis", () => {
  it("renders the per-room switch on a hotel leg, off by default", () => {
    render(<SuiteLegEditor leg={hotelLeg} value={makeHotelState()} onChange={vi.fn()} />)

    expect(screen.getByLabelText(/price this stay per room/i)).not.toBeChecked()
  })

  it("switches the stay to per_room without touching anything else", () => {
    const onChange = vi.fn()
    render(<SuiteLegEditor leg={hotelLeg} value={makeHotelState()} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText(/price this stay per room/i))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ accommodationPricingBasis: "per_room", nights: 3 }),
    )
  })

  it("says so when the stay's basis no longer matches the property's", () => {
    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={{ ...makeHotelState(), accommodationPricingBasis: "per_room" }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/price this stay per room/i)).toBeChecked()
    expect(screen.getByText(/this stay overrides that/i)).toBeInTheDocument()
  })

  it("is not rendered for a non-hotel leg", () => {
    render(<SuiteLegEditor leg={leg} value={makeLegState(mismatchedUnits)} onChange={vi.fn()} />)

    expect(screen.queryByLabelText(/price this stay per room/i)).not.toBeInTheDocument()
  })
})

const airlineRoutes: PackageLeg["routes"] = [
  {
    id: "route-cpt-ort",
    supplierId: "supplier-airline",
    name: "CPT > ORT",
    originLocationId: "loc-cpt",
    destinationLocationId: "loc-ort",
    directionMode: "round_trip",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "route-dur-ort",
    supplierId: "supplier-airline",
    name: "DUR > ORT",
    originLocationId: "loc-dur",
    destinationLocationId: "loc-ort",
    directionMode: "one_way",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "route-prose",
    supplierId: "supplier-airline",
    name: "Cape Town to Johannesburg",
    originLocationId: "loc-cpt",
    destinationLocationId: "loc-ort",
    directionMode: "one_way",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
]

const airlineLeg: PackageLeg = {
  ...leg,
  id: "leg-airline",
  supplierId: "supplier-airline",
  supplierName: "Fly Safair",
  supplierKind: "airline",
  label: "Fly Safair",
  pricingMode: "manual",
  routes: airlineRoutes,
}

function makeAirlineState(overrides: Partial<SuiteLegState> = {}): SuiteLegState {
  return {
    kind: "suite",
    legId: "leg-airline",
    supplierKind: "airline",
    accommodationPricingBasis: "per_person",
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: "2026-09-24",
    nights: null,
    ...noFlightSchedule,
    dateAnchor: "custom",
    notes: null,
    luggageStorageAvailable: false,
    rateTypeId: null,
    priceCurrency: "ZAR",
    units: [{ ...mismatchedUnits[0], adultCount: 2 }],
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
    ...overrides,
  }
}

const flightAnchorContext: TransferAnchorContext = {
  legLabel: "Table Bay Hotel",
  legKind: "hotel_property",
  startDate: "2026-09-24",
  endDate: "2026-09-27",
  endDateAssumed: false,
  // F-P1-4: a hotel is never the primary product on a train-headed booking (the fixtures in this
  // file are all trains) -- exercises the "anchored to something that isn't the main product"
  // warning alongside the existing resolved-date assertions below.
  isPrimaryProduct: false,
}

describe("SuiteLegEditor flight date anchor", () => {
  it("renders the pre/post/custom toggle on a flight and shows the manual picker on custom", () => {
    render(<SuiteLegEditor leg={airlineLeg} value={makeAirlineState()} onChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Pre" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Post" })).toBeInTheDocument()
    expect(screen.getByLabelText(/departure date/i)).toBeInTheDocument()
  })

  it("disables pre/post when there's no leg above to anchor to", () => {
    render(<SuiteLegEditor leg={airlineLeg} value={makeAirlineState()} onChange={vi.fn()} />)

    expect(screen.getByRole("button", { name: "Pre" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled()
    expect(screen.getByText(/nothing above this flight has a date to anchor to/i)).toBeInTheDocument()
  })

  it("shows the resolved departure date instead of a picker once anchored, given context", () => {
    render(
      <SuiteLegEditor
        leg={airlineLeg}
        value={makeAirlineState({ dateAnchor: "post" })}
        onChange={vi.fn()}
        flightAnchorContext={flightAnchorContext}
      />,
    )

    expect(screen.queryByLabelText(/^departure date$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/end of table bay hotel/i)).toBeInTheDocument()
  })

  it("names the anchor leg in the option itself and warns when it isn't the primary product", () => {
    render(
      <SuiteLegEditor
        leg={airlineLeg}
        value={makeAirlineState({ dateAnchor: "post" })}
        onChange={vi.fn()}
        flightAnchorContext={flightAnchorContext}
      />,
    )

    // F-P1-4: bare "Pre"/"Post" read as anchored to the primary leg -- once the anchor resolves,
    // the option itself names what it actually resolved to.
    expect(screen.getByRole("button", { name: "Before Table Bay Hotel" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "After Table Bay Hotel" })).toBeInTheDocument()
    expect(
      screen.getByText(/anchored to table bay hotel, not the booking's main product/i),
    ).toBeInTheDocument()
  })

  it("setting the anchor updates dateAnchor without touching other flight fields", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={airlineLeg}
        value={makeAirlineState()}
        onChange={onChange}
        flightAnchorContext={flightAnchorContext}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Before Table Bay Hotel" }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dateAnchor: "pre" }))
  })
})

/** Radix Select opens on keydown, which jsdom handles -- pointer events on the trigger do not. The
 * route select is always the first combobox on an airline leg (rate type and currency follow). */
function openRouteMenu() {
  fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "Enter" })
}

describe("SuiteLegEditor flight From/To auto-fill", () => {
  it("fills From/To with the route's airport codes when a route is chosen", () => {
    const onChange = vi.fn()
    render(<SuiteLegEditor leg={airlineLeg} value={makeAirlineState()} onChange={onChange} />)

    openRouteMenu()
    fireEvent.click(screen.getByRole("option", { name: "CPT > ORT" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: "route-cpt-ort",
        departureAirportCode: "CPT",
        arrivalAirportCode: "ORT",
      }),
    )
  })

  it("swaps From/To when the flip button is pressed", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={airlineLeg}
        value={makeAirlineState({
          routeId: "route-cpt-ort",
          departureAirportCode: "CPT",
          arrivalAirportCode: "ORT",
        })}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /flip travel direction/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        reversed: true,
        departureAirportCode: "ORT",
        arrivalAirportCode: "CPT",
      }),
    )
  })

  it("leaves a hand-typed code alone when picking a route whose name doesn't parse as codes", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={airlineLeg}
        value={makeAirlineState({ departureAirportCode: "HLA", arrivalAirportCode: "CPT" })}
        onChange={onChange}
      />,
    )

    openRouteMenu()
    fireEvent.click(screen.getByRole("option", { name: "Cape Town to Johannesburg" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: "route-prose",
        departureAirportCode: "HLA",
        arrivalAirportCode: "CPT",
      }),
    )
  })

  it("overwrites a hand-typed code when a new route is chosen", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={airlineLeg}
        value={makeAirlineState({
          routeId: "route-cpt-ort",
          departureAirportCode: "HLA",
          arrivalAirportCode: "CPT",
        })}
        onChange={onChange}
      />,
    )

    openRouteMenu()
    fireEvent.click(screen.getByRole("option", { name: "DUR > ORT" }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: "route-dur-ort",
        departureAirportCode: "DUR",
        arrivalAirportCode: "ORT",
      }),
    )
  })
})

const tourLeg: PackageLeg = {
  ...leg,
  id: "leg-tour",
  supplierId: "supplier-tour",
  supplierName: "Wild Horizons - Tours",
  supplierKind: "tour_operator",
  label: "Wild Horizons - Tours",
  routes: [
    {
      id: "route-cruise",
      supplierId: "supplier-tour",
      name: "Sundowner Cruise - Zimbabwe",
      originLocationId: null,
      destinationLocationId: null,
      suiteTypeId: "tour-cruise",
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ] as PackageLeg["routes"],
  suiteTypes: [
    { id: "tour-falls", supplierId: "supplier-tour", name: "Tour of the Falls - Zimbabwe", active: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    { id: "tour-cruise", supplierId: "supplier-tour", name: "Sundowner Cruise - Zimbabwe", active: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  ],
  rateCards: [],
}

function makeTourUnit(id: string, suiteTypeId: string | null): SuiteLegState["units"][number] {
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
    rateTypeId: null,
  }
}

function makeTourLegState(units: SuiteLegState["units"], routeId: string | null): SuiteLegState {
  return {
    ...makeLegState(units),
    legId: "leg-tour",
    supplierKind: "tour_operator",
    routeId,
  }
}

describe("SuiteLegEditor tour itinerary re-derivation", () => {
  it("clears the stamped itinerary when the tour whose type it matches is removed", () => {
    // route-cruise is stamped onto the leg (matching tour-cruise, unit-2's type). Removing unit-2
    // leaves only tour-falls, which has no matching itinerary — the stale itinerary must not stick.
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={tourLeg}
        value={makeTourLegState(
          [makeTourUnit("unit-1", "tour-falls"), makeTourUnit("unit-2", "tour-cruise")],
          "route-cruise",
        )}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /remove tour 2/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [expect.objectContaining({ id: "unit-1", suiteTypeId: "tour-falls" })],
        routeId: null,
      }),
    )
  })

  it("keeps the itinerary when the remaining tour still matches it", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={tourLeg}
        value={makeTourLegState(
          [makeTourUnit("unit-1", "tour-cruise"), makeTourUnit("unit-2", "tour-cruise")],
          "route-cruise",
        )}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /remove tour 2/i }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ routeId: "route-cruise" }),
    )
  })
})
