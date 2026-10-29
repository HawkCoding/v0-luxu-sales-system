import { describe, expect, it } from "vitest"
import {
  accommodationPriceLabel,
  cardNightlyRoomRate,
  describeCardRoomRateBreakdown,
  resolveAccommodationPricingBasis,
} from "./accommodation-basis"

describe("resolveAccommodationPricingBasis", () => {
  it("is always per_person for a non-hotel kind, regardless of row or supplier basis", () => {
    expect(
      resolveAccommodationPricingBasis({
        supplierKind: "train_operator",
        rowBasis: "per_room",
        supplierBasis: "per_room",
      }),
    ).toBe("per_person")
    expect(
      resolveAccommodationPricingBasis({
        supplierKind: "tour_operator",
        rowBasis: "per_room",
        supplierBasis: "per_room",
      }),
    ).toBe("per_person")
  })

  it("is per_person for a service whose supplier could not be resolved", () => {
    expect(
      resolveAccommodationPricingBasis({ supplierKind: null, rowBasis: "per_room", supplierBasis: "per_room" }),
    ).toBe("per_person")
  })

  it("prefers the stay's own basis over the supplier default", () => {
    expect(
      resolveAccommodationPricingBasis({
        supplierKind: "hotel_property",
        rowBasis: "per_person",
        supplierBasis: "per_room",
      }),
    ).toBe("per_person")
    expect(
      resolveAccommodationPricingBasis({
        supplierKind: "hotel_property",
        rowBasis: "per_room",
        supplierBasis: "per_person",
      }),
    ).toBe("per_room")
  })

  it("falls back to the supplier default when the stay has no basis of its own", () => {
    expect(
      resolveAccommodationPricingBasis({
        supplierKind: "hotel_property",
        rowBasis: null,
        supplierBasis: "per_room",
      }),
    ).toBe("per_room")
  })

  it("falls back to per_person -- the basis every existing stay was quoted under", () => {
    expect(
      resolveAccommodationPricingBasis({ supplierKind: "hotel_property", rowBasis: null, supplierBasis: null }),
    ).toBe("per_person")
    expect(
      resolveAccommodationPricingBasis({
        supplierKind: "hotel_property",
        rowBasis: undefined,
        supplierBasis: undefined,
      }),
    ).toBe("per_person")
  })
})

describe("accommodationPriceLabel", () => {
  it("labels per_person and per_room distinctly", () => {
    expect(accommodationPriceLabel("per_person")).toBe("per person per night")
    expect(accommodationPriceLabel("per_room")).toBe("per room per night")
  })
})

// DaVinci Deluxe Room, STO 2027: R4 130 on the card, two adults sharing (LTT-26-0019).
const deluxe = { pricePerPerson: 4130, childPrice: null, infantPrice: null }
const twoAdults = { adultCount: 2, childCount: 0, infantCount: 0 }

describe("cardNightlyRoomRate", () => {
  it("reads a per-person card against the room's occupants", () => {
    expect(cardNightlyRoomRate(deluxe, "per_person", twoAdults)).toBe(8260)
  })

  it("takes a per-room card's price as the room's rate whoever is in it", () => {
    expect(cardNightlyRoomRate(deluxe, "per_room", twoAdults)).toBe(4130)
  })

  it("charges an unset child or infant fare as free, and a set one as itself", () => {
    const card = { pricePerPerson: 4000, childPrice: 1500, infantPrice: null }
    expect(cardNightlyRoomRate(card, "per_person", { adultCount: 2, childCount: 1, infantCount: 1 })).toBe(9500)
    expect(cardNightlyRoomRate(deluxe, "per_person", { adultCount: 2, childCount: 1, infantCount: 0 })).toBe(8260)
  })
})

describe("describeCardRoomRateBreakdown", () => {
  const fmt = (amount: number) => `R${amount}`

  it("spells out how the room's nightly figure was added up", () => {
    expect(describeCardRoomRateBreakdown(deluxe, twoAdults, fmt)).toBe("2 adults × R4130")
    expect(
      describeCardRoomRateBreakdown(
        { pricePerPerson: 4000, childPrice: 1500, infantPrice: null },
        { adultCount: 1, childCount: 1, infantCount: 2 },
        fmt,
      ),
    ).toBe("1 adult × R4000 + 1 child × R1500 + 2 infants free")
  })

  it("is null for an empty room", () => {
    expect(describeCardRoomRateBreakdown(deluxe, { adultCount: 0, childCount: 0, infantCount: 0 }, fmt)).toBeNull()
  })
})
