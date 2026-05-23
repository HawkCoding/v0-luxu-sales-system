import { describe, expect, it } from "vitest"
import {
  buildCommissionBreakdown,
  calculateCommissionAmount,
  resolveCommission,
} from "./commission"

describe("resolveCommission", () => {
  it("returns no commission when nothing is set", () => {
    expect(
      resolveCommission({ supplierDefault: null, routeOverride: null }),
    ).toEqual({ type: null, value: 0, source: "none" })
  })

  it("uses supplier default when no overrides exist", () => {
    expect(
      resolveCommission({
        supplierDefault: { type: "percent", value: 15 },
        routeOverride: null,
      }),
    ).toEqual({ type: "percent", value: 15, source: "supplier" })
  })

  it("prefers a route override over the supplier default", () => {
    expect(
      resolveCommission({
        supplierDefault: { type: "percent", value: 15 },
        routeOverride: { type: "percent", value: 12 },
      }),
    ).toEqual({ type: "percent", value: 12, source: "route" })
  })

  it("prefers a line override over both", () => {
    expect(
      resolveCommission({
        supplierDefault: { type: "percent", value: 15 },
        routeOverride: { type: "percent", value: 12 },
        lineOverride: { type: "per_person", value: 2500 },
      }),
    ).toEqual({ type: "per_person", value: 2500, source: "line" })
  })

  it("skips partial entries (missing type or value)", () => {
    expect(
      resolveCommission({
        supplierDefault: { type: null, value: 15 },
        routeOverride: { type: "percent", value: null },
      }),
    ).toEqual({ type: null, value: 0, source: "none" })
  })
})

describe("calculateCommissionAmount", () => {
  it("applies a percent commission to the post-markup amount", () => {
    const amount = calculateCommissionAmount({
      amountAfterMarkup: 55000,
      passengerCount: 2,
      resolved: { type: "percent", value: 15, source: "supplier" },
    })
    expect(amount).toBe(8250)
  })

  it("applies a per-person commission across pax", () => {
    const amount = calculateCommissionAmount({
      amountAfterMarkup: 50000,
      passengerCount: 3,
      resolved: { type: "per_person", value: 1000, source: "route" },
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
      buildCommissionBreakdown({ type: "percent", value: 15, source: "supplier" }, 8250),
    ).toEqual({ type: "percent", value: 15, amount: 8250, source: "supplier" })
  })
})
