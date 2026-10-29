import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import type { PricingSnapshot } from "@/lib/types"
import { RoomOverrideNote } from "./room-override-note"

function snapshot(partial: Partial<PricingSnapshot>): PricingSnapshot {
  return { passengerKind: "adult", supplierKind: "hotel_property", ...partial } as PricingSnapshot
}

describe("RoomOverrideNote", () => {
  it("renders nothing for a line with neither an override nor a gifted night", () => {
    const { container } = render(<RoomOverrideNote snapshot={snapshot({})} quoteCurrency="ZAR" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("states the typed price as a room price and what the card charged the same room", () => {
    // LTT-26-0019 after the fix: the R4 750 typed for the room replaced the card's R8 260 for it
    // (two adults at R4 130), the figure Build Booking showed.
    const { container } = render(
      <RoomOverrideNote
        snapshot={snapshot({
          unit: "per room per night",
          manualRoomPrice: 4750,
          manualRoomPriceBase: 8260,
          manualRoomPriceSetByName: "Carmen de Jongh",
          manualRoomPriceSetAt: "2026-10-07T08:00:00Z",
          complimentaryNights: 1,
          stayNights: 2,
        })}
        quoteCurrency="ZAR"
      />,
    )
    expect(container).toHaveTextContent(/Manual room price — R\s?4[\s,]?750[.,]00 per room per night/)
    expect(container).toHaveTextContent(/replacing the rate card's R\s?8[\s,]?260[.,]00 ·/)
    expect(container).not.toHaveTextContent(/per person/)
    expect(container).toHaveTextContent(/set by Carmen de Jongh/)
    expect(container).toHaveTextContent(/First night complimentary · 1 of 2 nights charged/)
  })

  it("names a pre-fix line's per-person base for what it is instead of passing it off as the room's", () => {
    // Lines stamped before 2026-10 carried the bare adult fare as the base, under the stay's
    // per-person label.
    const { container } = render(
      <RoomOverrideNote
        snapshot={snapshot({ unit: "per person per night", manualRoomPrice: 4750, manualRoomPriceBase: 4130 })}
        quoteCurrency="ZAR"
      />,
    )
    expect(container).toHaveTextContent(/replacing the rate card's R\s?4[\s,]?130[.,]00 per person/)
  })

  it("says when no rate card covered the room", () => {
    const { container } = render(
      <RoomOverrideNote
        snapshot={snapshot({ unit: "per room per night", manualRoomPrice: 5000, manualRoomPriceBase: null })}
        quoteCurrency="ZAR"
      />,
    )
    expect(container).toHaveTextContent(/no rate card covered this room/)
  })
})
