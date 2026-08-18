import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TransportLegEditor } from "./transport-leg-editor"
import type { TransferAnchorContext, TransportLegState } from "@/lib/packages/apply-dialog-state"
import type { BookingTransportRequest, PackageLeg } from "@/lib/types"

const transferLeg: PackageLeg = {
  id: "leg-transfer",
  packageId: "pkg-1",
  supplierId: "supplier-transfer",
  supplierName: "Ulysses Tours & Transfers",
  supplierDescription: null,
  supplierKind: "transfers",
  pricingMode: "rate_card",
  baseRateTypeId: null,
  quoteRateTypeId: null,
  inheritedRateTypeName: null,
  applicableRateTypeIds: null,
  label: "Ulysses Tours & Transfers",
  sortOrder: 0,
  dateAnchor: null,
  routes: [
    {
      id: "route-1",
      supplierId: "supplier-transfer",
      name: "GT Station > Hotel",
      originLocationId: null,
      destinationLocationId: null,
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  suiteTypes: [
    {
      id: "vehicle-1",
      supplierId: "supplier-transfer",
      name: "Minivan",
      active: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  rateCards: [
    {
      id: "card-1",
      routeId: "route-1",
      suiteTypeId: "vehicle-1",
      rateTypeId: "rate-1",
      pricePerPerson: 500,
      childPrice: null,
      infantPrice: null,
      currency: "ZAR",
      validFrom: "2026-01-01",
      validTo: null,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
}

const rentalLeg: PackageLeg = {
  ...transferLeg,
  id: "leg-rental",
  supplierId: "supplier-rental",
  supplierName: "Avis Self-Drive",
  supplierKind: "vehicle_rental",
  label: "Avis Self-Drive",
}

function makeRequest(overrides: Partial<BookingTransportRequest> = {}): BookingTransportRequest {
  return {
    id: "req-1",
    bookingId: "",
    serviceType: "transfer",
    supplierId: "supplier-transfer",
    routeId: null,
    suiteTypeId: "vehicle-1",
    serviceId: "leg-transfer",
    pickupPoint: "Cape Town Station",
    dropoffPoint: "Hotel",
    pickupAt: "2026-09-24T11:00:00.000Z",
    dateAnchor: "custom",
    rentalDetails: null,
    passengerCount: 2,
    luggageCount: 2,
    flightNumber: null,
    priceOverride: null,
    priceOverrideSetAt: null,
    notes: null,
    supplierReference: null,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeLegState(
  requests: BookingTransportRequest[],
  overrides: Partial<TransportLegState> = {},
): TransportLegState {
  return {
    kind: "transport",
    legId: "leg-transfer",
    supplierKind: "transfers",
    selected: true,
    routeId: "route-1",
    rateTypeId: null,
    priceCurrency: "ZAR",
    requests,
    origin: "consultant",
    ...overrides,
  }
}

describe("TransportLegEditor price override", () => {
  it("stays collapsed on a request with no override, showing the rate card it prices off", () => {
    render(<TransportLegEditor leg={transferLeg} value={makeLegState([makeRequest()])} onChange={vi.fn()} />)

    expect(screen.getByText(/rate card/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/price override for transfer 1/i)).not.toBeInTheDocument()
  })

  it("reveals the field when the consultant asks to override", () => {
    render(<TransportLegEditor leg={transferLeg} value={makeLegState([makeRequest()])} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /override price/i }))
    expect(screen.getByLabelText(/price override for transfer 1/i)).toBeInTheDocument()
  })

  it("opens expanded when the request already carries a saved override", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ priceOverride: 850 })])}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/price override for transfer 1/i)).toHaveValue(850)
    expect(screen.getByText("Overridden")).toBeInTheDocument()
  })

  it("treats a zero price as a real override rather than an empty field", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ priceOverride: 0 })])}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/price override for transfer 1/i)).toBeInTheDocument()
    expect(screen.getByText("Overridden")).toBeInTheDocument()
  })

  it("clears the override and collapses on Revert", () => {
    const onChange = vi.fn()
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ priceOverride: 850 })])}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /revert/i }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        requests: [expect.objectContaining({ priceOverride: null })],
      }),
    )
  })

  it("still lets an override be typed when no rate card covers this vehicle category", () => {
    const noCardLeg: PackageLeg = { ...transferLeg, rateCards: [] }
    render(<TransportLegEditor leg={noCardLeg} value={makeLegState([makeRequest()])} onChange={vi.fn()} />)

    expect(screen.getByText(/no rate card price for this transfer yet/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /override price/i }))
    expect(screen.getByLabelText(/price override for transfer 1/i)).toBeInTheDocument()
  })

  it("falls back to the job's travel date when the request has no pickup time yet", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ pickupAt: null })])}
        onChange={vi.fn()}
        travelDate="2026-09-24"
      />,
    )

    expect(screen.getByText(/rate card/i)).toBeInTheDocument()
  })

  it("asks for a pickup date instead of showing the generic message when none is set anywhere", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ pickupAt: null })])}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/set a pickup date to see the transfer price/i)).toBeInTheDocument()
  })

  it("asks for a vehicle category before mentioning the rate card at all", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ suiteTypeId: null })])}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/select a vehicle category to see the transfer price/i)).toBeInTheDocument()
  })

  it("shows the multi-day total for a rental override, using the billable day count", () => {
    const rentalRequest = makeRequest({
      id: "req-rental-1",
      serviceType: "rental",
      suiteTypeId: "vehicle-1",
      priceOverride: 900,
      rentalDetails: {
        transportRequestId: "req-rental-1",
        returnAt: "2026-09-27T11:00:00.000Z",
        returnCutoffTime: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    })
    render(
      <TransportLegEditor
        leg={rentalLeg}
        value={makeLegState([rentalRequest], { legId: "leg-rental", supplierKind: "vehicle_rental" })}
        onChange={vi.fn()}
      />,
    )

    // 24-27 Sept is 3 billable days.
    expect(screen.getByText(/for 3 days/i)).toBeInTheDocument()
  })
})

describe("TransportLegEditor date anchor", () => {
  const trainAnchor: TransferAnchorContext = {
    legLabel: "Blue Train",
    legKind: "train_operator",
    startDate: "2026-09-24",
    endDate: "2026-09-26",
    endDateAssumed: false,
  }

  it("disables Pre/Post with no anchor context, leaving Custom's date picker live", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ dateAnchor: "custom" })])}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Pre" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Custom" })).toBeEnabled()
    expect(screen.getByRole("button", { name: /pickup date/i })).toBeEnabled()
    expect(screen.getByText(/nothing above this transfer has a date to anchor to/i)).toBeInTheDocument()
  })

  it("resolves Post to the anchor leg's end date and disables the date half", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ dateAnchor: "post" })])}
        onChange={vi.fn()}
        anchorContext={trainAnchor}
      />,
    )

    expect(screen.getByRole("button", { name: "Post" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /pickup date/i })).toBeDisabled()
    expect(screen.getByText(/26-09-2026/)).toBeInTheDocument()
    expect(screen.getByText(/blue train/i)).toBeInTheDocument()
  })

  it("switches to Custom and re-enables the date picker", () => {
    const onChange = vi.fn()
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ dateAnchor: "post" })])}
        onChange={onChange}
        anchorContext={trainAnchor}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Custom" }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        requests: [expect.objectContaining({ dateAnchor: "custom" })],
      }),
    )
  })

  it("shows the missing-duration warning only when Post's date is assumed", () => {
    render(
      <TransportLegEditor
        leg={transferLeg}
        value={makeLegState([makeRequest({ dateAnchor: "post" })])}
        onChange={vi.fn()}
        anchorContext={{ ...trainAnchor, endDate: trainAnchor.startDate, endDateAssumed: true }}
      />,
    )

    expect(screen.getByText(/has no journey length set/i)).toBeInTheDocument()
  })

  it("renders no anchor buttons on a vehicle rental — pickup and return stay manual", () => {
    const rentalRequest = makeRequest({
      id: "req-rental-1",
      serviceType: "rental",
      rentalDetails: {
        transportRequestId: "req-rental-1",
        returnAt: "2026-09-27T11:00:00.000Z",
        returnCutoffTime: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    })
    render(
      <TransportLegEditor
        leg={rentalLeg}
        value={makeLegState([rentalRequest], { legId: "leg-rental", supplierKind: "vehicle_rental" })}
        onChange={vi.fn()}
        anchorContext={trainAnchor}
      />,
    )

    expect(screen.queryByRole("button", { name: "Pre" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Post" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /pickup date/i })).toBeEnabled()
  })
})
