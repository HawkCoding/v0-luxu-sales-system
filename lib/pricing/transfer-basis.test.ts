import { describe, expect, it } from "vitest"
import { resolveTransferPax, resolveTransferPricingBasis, transferPriceLabel } from "./transfer-basis"

describe("resolveTransferPricingBasis", () => {
  it("is always per_vehicle for a rental, regardless of row or supplier basis", () => {
    expect(
      resolveTransferPricingBasis({ serviceType: "rental", rowBasis: "per_person", supplierBasis: "per_person" }),
    ).toBe("per_vehicle")
  })

  it("is always per_vehicle for a flight row", () => {
    expect(
      resolveTransferPricingBasis({ serviceType: "flight", rowBasis: "per_person", supplierBasis: "per_person" }),
    ).toBe("per_vehicle")
  })

  it("prefers the row's own basis over the supplier default", () => {
    expect(
      resolveTransferPricingBasis({ serviceType: "transfer", rowBasis: "per_vehicle", supplierBasis: "per_person" }),
    ).toBe("per_vehicle")
    expect(
      resolveTransferPricingBasis({ serviceType: "transfer", rowBasis: "per_person", supplierBasis: "per_vehicle" }),
    ).toBe("per_person")
  })

  it("falls back to the supplier default when the row has no basis of its own", () => {
    expect(
      resolveTransferPricingBasis({ serviceType: "transfer", rowBasis: null, supplierBasis: "per_person" }),
    ).toBe("per_person")
  })

  it("falls back to per_vehicle when neither row nor supplier has a basis", () => {
    expect(
      resolveTransferPricingBasis({ serviceType: "transfer", rowBasis: null, supplierBasis: null }),
    ).toBe("per_vehicle")
    expect(
      resolveTransferPricingBasis({ serviceType: "transfer", rowBasis: undefined, supplierBasis: undefined }),
    ).toBe("per_vehicle")
  })
})

describe("resolveTransferPax", () => {
  const fallback = { adultCount: 2, childCount: 1, infantCount: 1 }

  it("uses the booking's projected totals when all three counts are untouched", () => {
    expect(
      resolveTransferPax({ adultCount: null, childCount: null, infantCount: null }, fallback),
    ).toEqual(fallback)
  })

  it("coalesces the other two to 0 once any one count is set, not the fallback", () => {
    expect(
      resolveTransferPax({ adultCount: 4, childCount: null, infantCount: null }, fallback),
    ).toEqual({ adultCount: 4, childCount: 0, infantCount: 0 })
  })

  it("respects an explicit zero on one count while others are still typed", () => {
    expect(
      resolveTransferPax({ adultCount: 3, childCount: 0, infantCount: null }, fallback),
    ).toEqual({ adultCount: 3, childCount: 0, infantCount: 0 })
  })

  it("uses every typed count when all three are set", () => {
    expect(
      resolveTransferPax({ adultCount: 6, childCount: 2, infantCount: 1 }, fallback),
    ).toEqual({ adultCount: 6, childCount: 2, infantCount: 1 })
  })
})

describe("transferPriceLabel", () => {
  it("labels per_vehicle and per_person distinctly", () => {
    expect(transferPriceLabel("per_vehicle")).toBe("per vehicle")
    expect(transferPriceLabel("per_person")).toBe("per person")
  })
})
