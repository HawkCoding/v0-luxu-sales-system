import { describe, expect, it } from "vitest"
import { calculateDepositAmount } from "../constants"

describe("calculateDepositAmount", () => {
  it("calculates the default deposit rounded to cents", () => {
    expect(calculateDepositAmount(1234.56)).toBe(308.64)
  })
})
