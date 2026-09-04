import { describe, expect, it } from "vitest"
import { accommodationPriceLabel, resolveAccommodationPricingBasis } from "./accommodation-basis"

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
