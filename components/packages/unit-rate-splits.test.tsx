import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { RatePerGuestRows, RatePerGuestSwitch } from "./unit-rate-splits"
import type { RateType } from "@/lib/types"
import type { SuiteUnitState } from "@/lib/packages/apply-dialog-state"

const rateTypes = [
  { id: "sa", name: "SA Resident", isDefault: true },
  { id: "tw", name: "TW International", isDefault: false },
] as unknown as RateType[]

const unit = {
  id: "t1",
  adultCount: 2,
  childCount: 1,
  infantCount: 0,
  rateSplits: [{ rateTypeId: "tw", adultCount: 1, childCount: 0, infantCount: 0 }],
} as unknown as SuiteUnitState

describe("RatePerGuestSwitch", () => {
  it("says who pays the suite's rate while off, and reports a flip", () => {
    const onCheckedChange = vi.fn()
    render(
      <RatePerGuestSwitch unitId="t1" checked={false} onCheckedChange={onCheckedChange} unitNoun="suite" rateName="SA Resident" />,
    )
    expect(screen.getByText("Everyone in this suite pays SA Resident.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "Rate per guest" }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})

describe("RatePerGuestRows", () => {
  it("lists one rate per guest, the suite's rate first, then the splits", () => {
    render(
      <RatePerGuestRows
        unit={unit}
        rateTypes={rateTypes}
        allowedRateTypeIds={null}
        unitRateTypeId="sa"
        rateName="SA Resident"
        unitNoun="suite"
        onChange={vi.fn()}
        noCardWarning={(rateTypeId) => (rateTypeId === "tw" ? "No TW International rate card for this suite type." : null)}
      />,
    )
    expect(screen.getByRole("group", { name: "Rate per guest" })).toBeInTheDocument()
    expect(screen.getByLabelText("Adult 1")).toHaveTextContent("Suite rate (SA Resident)")
    expect(screen.getByLabelText("Adult 2")).toHaveTextContent("TW International")
    expect(screen.getByLabelText("Child 1")).toHaveTextContent("Suite rate (SA Resident)")
    expect(screen.getByText("No TW International rate card for this suite type.")).toBeInTheDocument()
  })

  it("offers the suite's rate once, says what each prints as, and shows each guest's card fare", () => {
    const labelled = [
      { id: "sa", name: "SA Resident", isDefault: false, shortLabel: "SA" },
      { id: "tw", name: "TW International", isDefault: false, shortLabel: "TW" },
    ] as unknown as RateType[]
    render(
      <RatePerGuestRows
        unit={unit}
        rateTypes={labelled}
        allowedRateTypeIds={null}
        unitRateTypeId="sa"
        rateName="SA Resident"
        unitNoun="suite"
        onChange={vi.fn()}
        noCardWarning={() => null}
        rateCardPrice={(rateTypeId, kind) => `${rateTypeId ?? "sa"}-${kind}`}
      />,
    )
    expect(screen.getByText("Rate card sa-adult")).toBeInTheDocument()
    expect(screen.getByText("Rate card tw-adult")).toBeInTheDocument()
    expect(screen.getByText("Rate card sa-child")).toBeInTheDocument()

    fireEvent.keyDown(screen.getByLabelText("Adult 1"), { key: "Enter" })
    const options = screen.getAllByRole("option").map((option) => option.textContent)
    expect(options).toEqual(["Suite rate (SA Resident) · prints (SA)", "TW International · prints (TW)"])
  })
})
