import { describe, expect, it } from "vitest"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "./commission"

describe("resolveCommission", () => {
  it("returns no commission when nothing is set", () => {
    expect(
      resolveCommission({}),
    ).toEqual({ type: null, value: 0, source: "none" })
  })

  it("returns no commission when lineOverride is null", () => {
    expect(
      resolveCommission({ lineOverride: null }),
    ).toEqual({ type: null, value: 0, source: "none" })
  })

  it("uses line override when set", () => {
    expect(
      resolveCommission({
        lineOverride: { type: "per_person", value: 2500 },
      }),
    ).toEqual({ type: "per_person", value: 2500, source: "line" })
  })

  it("skips partial line override (missing type or value)", () => {
    expect(
      resolveCommission({
        lineOverride: { type: null, value: 15 },
      }),
    ).toEqual({ type: null, value: 0, source: "none" })
  })
})

describe("calculateCommissionAmount", () => {
  it("applies a percent commission to the post-markup amount", () => {
    const amount = calculateCommissionAmount({
      amountAfterMarkup: 55000,
      passengerCount: 2,
      resolved: { type: "percent", value: 15, source: "line" },
    })
    expect(amount).toBe(8250)
  })

  it("applies a per-person commission across pax", () => {
    const amount = calculateCommissionAmount({
      amountAfterMarkup: 50000,
      passengerCount: 3,
      resolved: { type: "per_person", value: 1000, source: "line" },
    })
    expect(amount).toBe(3000)
  })

  it("returns 0 when no commission is configured", () => {
    expect(
      calculateCommissionAmount({
        amountAfterMarkup: 100,
        passengerCount: 1,
        resolved: { type: null, value: 0, source: "none" },
      }),
    ).toBe(0)
  })
})

describe("buildCommissionBreakdown", () => {
  it("returns null when no commission is configured", () => {
    expect(
      buildCommissionBreakdown({ type: null, value: 0, source: "none" }, 0),
    ).toBeNull()
  })

  it("packages type, value, amount, and source into a breakdown", () => {
    expect(
      buildCommissionBreakdown({ type: "percent", value: 15, source: "line" }, 8250),
    ).toEqual({ type: "percent", value: 15, amount: 8250, source: "line" })
  })
})
