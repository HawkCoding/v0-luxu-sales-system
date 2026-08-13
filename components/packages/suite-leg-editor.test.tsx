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
  label: "The Blue Train",
  sortOrder: 0,
  dateAnchor: null,
  routes: [],
  rateCards: [],
  suiteTypes: [],
}

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
