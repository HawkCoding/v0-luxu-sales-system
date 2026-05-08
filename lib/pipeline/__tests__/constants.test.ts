import { describe, expect, it } from "vitest"
import { calculateDepositAmount, parseDepositPercentage } from "../constants"

describe("calculateDepositAmount", () => {
  it("calculates the default deposit rounded to cents", () => {
    expect(calculateDepositAmount(1234.56)).toBe(308.64)
  })

  it("supports a configured deposit percentage", () => {
    expect(calculateDepositAmount(1234.56, 30)).toBe(370.37)
  })
})

describe("parseDepositPercentage", () => {
  it("falls back to the default for invalid settings values", () => {
    expect(parseDepositPercentage("not-a-number")).toBe(25)
  })

  it("keeps configured values inside the valid range", () => {
    expect(parseDepositPercentage("30.5")).toBe(30.5)
    expect(parseDepositPercentage("-5")).toBe(0)
    expect(parseDepositPercentage("105")).toBe(100)
  })
})
