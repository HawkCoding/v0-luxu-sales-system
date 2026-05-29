import { describe, expect, it } from "vitest"
import { calculateRefund } from "./calculate-refund"

describe("calculateRefund", () => {
  it("cancellation fee = deposit when deposit is non-refundable", () => {
    const result = calculateRefund(5000, 2000, false)
    expect(result.cancellationFee).toBe(2000)
    expect(result.suggestedRefund).toBe(3000)
  })

  it("cancellation fee = 0 when deposit is refundable", () => {
    const result = calculateRefund(5000, 2000, true)
    expect(result.cancellationFee).toBe(0)
    expect(result.suggestedRefund).toBe(5000)
  })

  it("refund is floored at 0 when total paid is less than cancellation fee", () => {
    const result = calculateRefund(1000, 2000, false)
    expect(result.cancellationFee).toBe(2000)
    expect(result.suggestedRefund).toBe(0)
  })

  it("refund is exactly 0 when total paid equals cancellation fee", () => {
    const result = calculateRefund(2000, 2000, false)
    expect(result.cancellationFee).toBe(2000)
    expect(result.suggestedRefund).toBe(0)
  })

  it("handles zero paid and zero deposit correctly", () => {
    const result = calculateRefund(0, 0, false)
    expect(result.cancellationFee).toBe(0)
    expect(result.suggestedRefund).toBe(0)
  })

  it("rounds to 2 decimal places", () => {
    const result = calculateRefund(1000.005, 100, false)
    expect(result.suggestedRefund).toBe(900.01)
  })
})
