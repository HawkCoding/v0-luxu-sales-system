import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SuiteLegEditor } from "./suite-leg-editor"
import { TransportLegEditor } from "./transport-leg-editor"
import type { PaxGroupEditorContext } from "./pax-group-editor-context"
import type { SuiteLegState, SuiteUnitState, TransportLegState } from "@/lib/packages/apply-dialog-state"
import type { BookingTransportRequest, PackageLeg, RateType, SupplierKind } from "@/lib/types"
import type { PaxGroupView } from "@/lib/packages/pax-group-toggles"

function packageLeg(id: string, supplierKind: SupplierKind, name: string): PackageLeg {
  return {
    id,
    packageId: "pkg-1",
    supplierId: `supplier-${id}`,
    supplierName: name,
    supplierDescription: null,
    supplierKind,
    pricingMode: "rate_card",
    transferPricingBasis: "per_person",
    accommodationPricingBasis: "per_person",
    baseRateTypeId: null,
    quoteRateTypeId: null,
    inheritedRateTypeName: "SA Resident",
    applicableRateTypeIds: null,
    label: name,
    sortOrder: 0,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [
      { id: "deluxe", supplierId: `supplier-${id}`, name: "Deluxe Suite", active: true, createdAt: "", updatedAt: "" },
    ],
  }
}

function unit(id: string, overrides: Partial<SuiteUnitState> = {}): SuiteUnitState {
  return {
    id,
    suiteTypeId: "deluxe",
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

function legState(legId: string, supplierKind: SupplierKind, units: SuiteUnitState[]): SuiteLegState {
  return {
    kind: "suite",
    legId,
    supplierKind,
    accommodationPricingBasis: "per_person",
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: "2026-09-24",
    nights: 2,
    departureTime: null,
    arrivalDate: null,
    arrivalTime: null,
    flightNumber: null,
    departureAirportCode: null,
    arrivalAirportCode: null,
    handLuggageKg: null,
    checkedLuggageKg: null,
    dateAnchor: "custom",
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

function view(id: string, position: number, adults: number, children = 0, typedLabel: string | null = null): PaxGroupView {
  return {
    id,
    position,
    typedLabel,
    autoLabel: `Deluxe Suite ${position}`,
    label: typedLabel ?? `Deluxe Suite ${position}`,
    shortLabel: typedLabel ?? "Deluxe Suite",
    pax: { adultCount: adults, childCount: children, infantCount: 0 },
    primaryUnit: null,
  }
}

const groups = [view("g1", 1, 2), view("g2", 2, 1, 1, "Parents"), view("g3", 3, 0, 2)]

function context(overrides: Partial<PaxGroupEditorContext> = {}): PaxGroupEditorContext {
  return {
    groups,
    activeGroupId: null,
    primaryLegId: "leg-train",
    noun: "Suite",
    problems: new Map(),
    onLabelChange: vi.fn(),
    onDuplicateGroup: vi.fn(),
    onRemoveGroup: vi.fn(),
    onRemoveFromLeg: vi.fn(),
    ...overrides,
  }
}

const trainLeg = packageLeg("leg-train", "train_operator", "Rovos Rail")
const hotelLeg = packageLeg("leg-hotel", "hotel_property", "12 Apostles")
const train = legState("leg-train", "train_operator", [
  unit("t1", { paxGroupIds: ["g1"] }),
  unit("t2", { paxGroupIds: ["g2"], adultCount: 1, childCount: 1 }),
  unit("t3", { paxGroupIds: ["g3"], adultCount: 0, childCount: 2 }),
])
const hotel = legState("leg-hotel", "hotel_property", [
  unit("h1", { paxGroupIds: ["g1"] }),
  unit("h2", { paxGroupIds: ["g2", "g3"], adultCount: 3, childCount: 1 }),
])
const rateTypes = [
  { id: "sa", name: "SA Resident", isDefault: true, archivedAt: null },
  { id: "tw", name: "TW International", isDefault: false, archivedAt: null },
] as unknown as RateType[]

describe("SuiteLegEditor without pax groups", () => {
  it("shows no group controls", () => {
    render(<SuiteLegEditor leg={trainLeg} value={legState("leg-train", "train_operator", [unit("t1")])} onChange={vi.fn()} />)
    expect(screen.queryByLabelText(/Suite name/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Choose suites/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Rate per guest" })).not.toBeInTheDocument()
  })
})

describe("SuiteLegEditor in group mode", () => {
  it("heads each primary unit with its suite, a name field, Duplicate and Remove", () => {
    const ctx = context()
    render(
      <SuiteLegEditor leg={trainLeg} value={train} onChange={vi.fn()} primarySupplierId="supplier-leg-train" rateTypes={rateTypes} paxGroups={ctx} />,
    )
    expect(screen.getByRole("heading", { name: "Suite 2" })).toBeInTheDocument()
    // The heading row says what prints; the name field lives in the fittings grid.
    expect(screen.getByText("Prints as “Parents”")).toBeInTheDocument()
    expect(screen.getByText("Prints as “Deluxe Suite 1”")).toBeInTheDocument()
    const name = screen.getByLabelText("Suite name", { selector: "#suite-name-g2" })
    expect(name).toHaveClass("h-9", "w-full")
    expect(name).toHaveValue("Parents")
    expect(screen.getByLabelText("Suite name", { selector: "#suite-name-g1" })).toHaveAttribute("placeholder", "Deluxe Suite 1")

    fireEvent.change(name, { target: { value: "  Mum & Dad " } })
    expect(ctx.onLabelChange).toHaveBeenCalledWith("g2", "Mum & Dad")
    fireEvent.click(screen.getByRole("button", { name: "Duplicate Suite 3" }))
    expect(ctx.onDuplicateGroup).toHaveBeenCalledWith("g3")
    fireEvent.click(screen.getByRole("button", { name: "Remove Suite 3" }))
    expect(ctx.onRemoveGroup).toHaveBeenCalledWith("g3")
  })

  it("offers a per-guest rate on a suite with 2+ guests", () => {
    const onChange = vi.fn()
    render(
      <SuiteLegEditor leg={trainLeg} value={train} onChange={onChange} primarySupplierId="supplier-leg-train" rateTypes={rateTypes} paxGroups={context()} />,
    )
    const switches = screen.getAllByRole("switch", { name: "Rate per guest" })
    expect(switches).toHaveLength(3)
    fireEvent.click(switches[0])
    expect(screen.getByRole("group", { name: "Rate per guest" })).toBeInTheDocument()
    expect(screen.getByLabelText("Adult 1")).toHaveTextContent("Suite rate (SA Resident)")
  })

  it("shows only the suite's own card on the primary leg in its view, with no tally or Add suite", () => {
    render(
      <SuiteLegEditor
        leg={trainLeg}
        value={train}
        onChange={vi.fn()}
        primarySupplierId="supplier-leg-train"
        expectedTotals={{ adultCount: 3, childCount: 3, infantCount: 0 }}
        paxGroups={context({ activeGroupId: "g2" })}
      />,
    )
    expect(screen.getByRole("heading", { name: "Suite 2" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Suite 1" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Add suite/ })).not.toBeInTheDocument()
  })

  it("gives a non-primary unit a For control and says when its counts follow its suites", () => {
    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={hotel}
        onChange={vi.fn()}
        expectedTotals={{ adultCount: 3, childCount: 3, infantCount: 0 }}
        paxGroups={context()}
      />,
    )
    expect(screen.getByText(/5\/3 adults/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Room 2" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Choose suites for room 2 on 12 Apostles, now Suites 2 & 3/ })).toBeInTheDocument()
    expect(screen.getByText("Guests follow Suite 1 (2 adults). Edit to override.")).toBeInTheDocument()
  })

  it("flags a unit holding a different headcount than its suites, with Match suites", () => {
    const onChange = vi.fn()
    const edited = legState("leg-hotel", "hotel_property", [unit("h2", { paxGroupIds: ["g2", "g3"], adultCount: 3, childCount: 1 }), unit("h1")])
    render(<SuiteLegEditor leg={hotelLeg} value={edited} onChange={onChange} paxGroups={context()} />)
    expect(screen.getByText("Suites 2 & 3 have 1 adult, 3 children; this room holds 3 adults, 1 child.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Match suites" }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [expect.objectContaining({ adultCount: 1, childCount: 3 }), expect.anything()],
      }),
    )
  })

  it("in a suite's view filters the rooms, keeps their numbers, and can take the suite off the leg", () => {
    const ctx = context({ activeGroupId: "g3" })
    const onChange = vi.fn()
    render(
      <SuiteLegEditor
        leg={hotelLeg}
        value={hotel}
        onChange={onChange}
        expectedTotals={{ adultCount: 3, childCount: 3, infantCount: 0 }}
        paxGroups={ctx}
      />,
    )
    // The leg-wide room tally means nothing in one suite's view.
    expect(screen.queryByText(/\/3 adults/)).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Room 1" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Room 2" })).toBeInTheDocument()
    expect(screen.getByText(/Shared with Suite 2 — changes apply to both\./)).toBeInTheDocument()
    expect(screen.getByText("Meal plan, nights, dates and rate are shared by every suite on this service.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "How to give Suite 3 different ones" })).toBeInTheDocument()
    expect(screen.queryByText(/Need different ones/)).not.toBeInTheDocument()
    // A shared room has no trash here.
    expect(screen.queryByRole("button", { name: /Remove room 2/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Remove 12 Apostles from Suite 3" }))
    expect(ctx.onRemoveFromLeg).toHaveBeenCalledWith("leg-hotel", "g3")

    fireEvent.click(screen.getByRole("button", { name: "Add room for Suite 3" }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [expect.anything(), expect.anything(), expect.objectContaining({ paxGroupIds: ["g3"], adultCount: 0, childCount: 2 })],
      }),
    )
  })
})

function transferRequest(id: string, overrides: Partial<BookingTransportRequest> = {}): BookingTransportRequest {
  return {
    id,
    bookingId: "",
    serviceType: "transfer",
    supplierId: "supplier-leg-transfer",
    routeId: null,
    suiteTypeId: null,
    serviceId: "leg-transfer",
    pickupPoint: "",
    dropoffPoint: "",
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
    adultCount: 2,
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

describe("TransportLegEditor in group mode", () => {
  const transferLeg = packageLeg("leg-transfer", "transfers", "Minibus transfer")
  const transfers: TransportLegState = {
    kind: "transport",
    legId: "leg-transfer",
    supplierKind: "transfers",
    selected: true,
    routeId: null,
    rateTypeId: null,
    priceCurrency: "ZAR",
    requests: [transferRequest("r1", { paxGroupIds: ["g1"] }), transferRequest("r2")],
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
  }

  it("heads each trip with its number and a For control, and follows its suites' guests", () => {
    render(<TransportLegEditor leg={transferLeg} value={transfers} onChange={vi.fn()} paxGroups={context()} />)
    expect(screen.getByRole("heading", { name: "Transfer 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Choose suites for transfer 2 on Minibus transfer, now All suites/ })).toBeInTheDocument()
    expect(screen.getByText("Guests follow Suite 1 (2 adults). Edit to override.")).toBeInTheDocument()
  })

  it("in a suite's view shows only its trips and adds one for it", () => {
    const onChange = vi.fn()
    render(<TransportLegEditor leg={transferLeg} value={transfers} onChange={onChange} paxGroups={context({ activeGroupId: "g2" })} />)
    expect(screen.queryByRole("heading", { name: "Transfer 1" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Transfer 2" })).toBeInTheDocument()
    expect(screen.getByText(/Shared by every suite/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add transfer for Suite 2" }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        requests: [expect.anything(), expect.anything(), expect.objectContaining({ paxGroupIds: ["g2"], adultCount: 1, childCount: 1 })],
      }),
    )
  })
})
