import { describe, expect, it } from "vitest"
import { areRateCardDateRangesOverlapping, checkRateCardOverlaps } from "./overlap"

const ROUTE_A = "00000000-0000-4000-8000-000000000001"
const ROUTE_B = "00000000-0000-4000-8000-000000000002"
const SUITE_A = "00000000-0000-4000-8000-000000000011"
const SUITE_B = "00000000-0000-4000-8000-000000000012"
const RATE_TYPE = "00000000-0000-4000-8000-000000000099"
const RATE_TYPE_B = "00000000-0000-4000-8000-000000000098"

function card(
  routeId: string,
  suiteTypeId: string,
  validFrom: string,
  validTo: string | null,
  rateTypeId = RATE_TYPE,
) {
  return { rateTypeId, routeId, suiteTypeId, validFrom, validTo }
}

describe("areRateCardDateRangesOverlapping", () => {
  it("detects two bounded ranges that overlap", () => {
    expect(
      areRateCardDateRangesOverlapping(
        { validFrom: "2026-01-01", validTo: "2026-06-30" },
        { validFrom: "2026-03-01", validTo: "2026-12-31" },
      ),
    ).toBe(true)
  })

  it("treats adjacent non-overlapping bounded ranges as not overlapping", () => {
    expect(
      areRateCardDateRangesOverlapping(
        { validFrom: "2026-01-01", validTo: "2026-06-30" },
        { validFrom: "2026-07-01", validTo: "2026-12-31" },
      ),
    ).toBe(false)
  })

  it("detects overlap between bounded and open-ended range", () => {
    expect(
      areRateCardDateRangesOverlapping(
        { validFrom: "2026-01-01", validTo: "2026-12-31" },
        { validFrom: "2026-06-01", validTo: null },
      ),
    ).toBe(true)
  })

  it("treats adjacent bounded + open-ended ranges as not overlapping", () => {
    expect(
      areRateCardDateRangesOverlapping(
        { validFrom: "2026-01-01", validTo: "2026-06-30" },
        { validFrom: "2026-07-01", validTo: null },
      ),
    ).toBe(false)
  })
})

describe("checkRateCardOverlaps", () => {
  it("throws when two cards on the same route+suite+rateType have overlapping dates", () => {
    expect(() =>
      checkRateCardOverlaps([
        card(ROUTE_A, SUITE_A, "2026-01-01", "2026-06-30"),
        card(ROUTE_A, SUITE_A, "2026-03-01", "2026-12-31"),
      ]),
    ).toThrow("Overlapping rate card periods are not allowed")
  })

  it("does not throw for adjacent non-overlapping ranges on the same route+suite", () => {
    expect(() =>
      checkRateCardOverlaps([
        card(ROUTE_A, SUITE_A, "2026-01-01", "2026-06-30"),
        card(ROUTE_A, SUITE_A, "2026-07-01", "2026-12-31"),
      ]),
    ).not.toThrow()
  })

  it("allows overlapping dates on different routes", () => {
    expect(() =>
      checkRateCardOverlaps([
        card(ROUTE_A, SUITE_A, "2026-01-01", "2026-12-31"),
        card(ROUTE_B, SUITE_A, "2026-01-01", "2026-12-31"),
      ]),
    ).not.toThrow()
  })

  it("allows overlapping dates on different pricing options (suite types)", () => {
    expect(() =>
      checkRateCardOverlaps([
        card(ROUTE_A, SUITE_A, "2026-01-01", "2026-12-31"),
        card(ROUTE_A, SUITE_B, "2026-01-01", "2026-12-31"),
      ]),
    ).not.toThrow()
  })

  it("allows overlapping dates on different rate types for the same route+suite", () => {
    expect(() =>
      checkRateCardOverlaps([
        card(ROUTE_A, SUITE_A, "2026-01-01", "2026-06-30", RATE_TYPE),
        card(ROUTE_A, SUITE_A, "2026-01-01", "2026-06-30", RATE_TYPE_B),
      ]),
    ).not.toThrow()
  })
})
