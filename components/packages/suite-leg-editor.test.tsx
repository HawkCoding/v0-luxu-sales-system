import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SuiteLegEditor } from "./suite-leg-editor"
import type { SuiteLegState } from "@/lib/packages/apply-dialog-state"
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
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: "2026-09-24",
    nights: null,
    ...noFlightSchedule,
    dateAnchor: null,
    notes: null,
    rateTypeId: null,
    priceCurrency: "ZAR",
    units,
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
    selected: true,
    routeId: "route-1",
    reversed: false,
    serviceDate: "2026-09-24",
    nights: 3,
    ...noFlightSchedule,
    dateAnchor: "custom",
    notes: null,
    rateTypeId: null,
    priceCurrency: "ZAR",
    units: [{ ...mismatchedUnits[0], suiteTypeId: "suite-1", adultCount: 2, ...overrides }],
    origin: "consultant",
  }
}

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
})
