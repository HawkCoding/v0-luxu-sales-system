import { describe, expect, it } from "vitest"
import { subtotalNetOfHiddenDiscount } from "./hidden-discount"

describe("subtotalNetOfHiddenDiscount", () => {
  it("takes a hidden discount off the subtotal", () => {
    expect(subtotalNetOfHiddenDiscount(272_400, 27_240, false)).toBe(245_160)
  })

  it("leaves a visible discount to its own row", () => {
    expect(subtotalNetOfHiddenDiscount(272_400, 27_240, true)).toBe(272_400)
    expect(subtotalNetOfHiddenDiscount(272_400, 27_240, undefined)).toBe(272_400)
    expect(subtotalNetOfHiddenDiscount(272_400, 27_240, null)).toBe(272_400)
  })

  it("leaves the subtotal alone with no discount", () => {
    expect(subtotalNetOfHiddenDiscount(272_400, 0, false)).toBe(272_400)
    expect(subtotalNetOfHiddenDiscount(272_400, null, false)).toBe(272_400)
  })

  it("never goes below zero", () => {
    expect(subtotalNetOfHiddenDiscount(100, 500, false)).toBe(0)
  })
})
