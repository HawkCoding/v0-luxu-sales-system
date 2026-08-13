import { describe, expect, it } from "vitest"
import { resolveDepositAmount } from "./resolve-deposit-amount"

describe("resolveDepositAmount", () => {
  it("uses the deposit invoice amount when one exists", () => {
    expect(resolveDepositAmount(2000, null, 25)).toBe(2000)
  })

  it("prefers the deposit invoice over a full invoice", () => {
    expect(resolveDepositAmount(2000, 10000, 25)).toBe(2000)
  })

  it("falls back to a notional percentage of the full invoice", () => {
    expect(resolveDepositAmount(null, 10000, 25)).toBe(2500)
  })

  it("honours a non-default deposit percentage on the fallback", () => {
    expect(resolveDepositAmount(null, 10000, 40)).toBe(4000)
  })

  it("returns 0 when neither invoice exists", () => {
    expect(resolveDepositAmount(null, null, 25)).toBe(0)
  })

  it("treats a zero deposit invoice as a real zero, not a missing invoice", () => {
    expect(resolveDepositAmount(0, 10000, 25)).toBe(0)
  })
})
