import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import type { PricingSnapshot } from "@/lib/types"
import { TrainOverrideNote } from "./train-override-note"

function snapshot(partial: Partial<PricingSnapshot>): PricingSnapshot {
  return { passengerKind: "adult", ...partial } as PricingSnapshot
}

describe("TrainOverrideNote", () => {
  it("renders nothing for a line with no train fare override", () => {
    const { container } = render(<TrainOverrideNote snapshot={snapshot({})} quoteCurrency="ZAR" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("names the passenger kind, the typed fare, what it replaced and who set it", () => {
    const { container } = render(
      <TrainOverrideNote
        snapshot={snapshot({
          passengerKind: "child",
          manualTrainFare: 4000,
          manualTrainFareBase: 5000,
          manualTrainFareSetByName: "Carmen",
          manualTrainFareSetAt: "2026-09-29T08:00:00Z",
        })}
        quoteCurrency="ZAR"
      />,
    )
    expect(container).toHaveTextContent(/Manual child fare/)
    expect(container).toHaveTextContent(/4[\s,]?000/)
    expect(container).toHaveTextContent(/replacing R\s?5[\s,]?000/)
    expect(container).toHaveTextContent(/set by Carmen/)
  })

  it("treats a zero fare as a real override and says when no card covered the suite", () => {
    const { container } = render(
      <TrainOverrideNote snapshot={snapshot({ manualTrainFare: 0, manualTrainFareBase: null })} quoteCurrency="ZAR" />,
    )
    expect(container).toHaveTextContent(/no rate card covered this suite/)
  })

  it("says an inherited child fare follows the typed adult fare rather than calling it a manual child fare", () => {
    const { container } = render(
      <TrainOverrideNote
        snapshot={snapshot({
          passengerKind: "child",
          manualTrainFare: 0,
          manualTrainFareBase: 10000,
          manualTrainFareInheritedFrom: "adult",
        })}
        quoteCurrency="ZAR"
      />,
    )
    expect(container).toHaveTextContent(/Child fare follows the manual adult fare/)
    expect(container).not.toHaveTextContent(/Manual child fare/)
    expect(container).toHaveTextContent(/replacing R\s?10[\s,]?000/)
  })
})
