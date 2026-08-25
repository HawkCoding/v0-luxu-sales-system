import { describe, expect, it } from "vitest"

import { isWithinDateRange, matchesSearch } from "./list-filters"

describe("matchesSearch", () => {
  it("matches everything when the query is empty", () => {
    expect(matchesSearch(["Jacomien", "jaco@example.com"], "")).toBe(true)
    expect(matchesSearch(["Jacomien"], "   ")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(matchesSearch(["Jacomien Botha"], "JACO")).toBe(true)
  })

  it("matches against any field", () => {
    expect(matchesSearch(["Jan", "jaco@example.com"], "example")).toBe(true)
  })

  it("returns false when no field matches", () => {
    expect(matchesSearch(["Jan", "jan@example.com"], "rovos")).toBe(false)
  })

  it("skips null/undefined fields without throwing", () => {
    expect(matchesSearch([null, undefined, "Rovos Rail"], "rovos")).toBe(true)
    expect(matchesSearch([null, undefined], "rovos")).toBe(false)
  })
})

describe("isWithinDateRange", () => {
  it("matches everything when both bounds are unset", () => {
    expect(isWithinDateRange("2026-08-24T14:00:00.000Z")).toBe(true)
    expect(isWithinDateRange(null)).toBe(true)
  })

  it("includes a record created any time on the 'to' day (the end-of-day regression)", () => {
    // 14:00 UTC on 24 Aug is 16:00 SAST — still the 24th in APP_TIME_ZONE.
    expect(isWithinDateRange("2026-08-24T14:00:00.000Z", undefined, "2026-08-24")).toBe(true)
  })

  it("includes a record created late in the day, just before the SAST midnight rollover", () => {
    // 21:59 UTC on 24 Aug is 23:59 SAST on the 24th.
    expect(isWithinDateRange("2026-08-24T21:59:00.000Z", undefined, "2026-08-24")).toBe(true)
  })

  it("excludes a record created the day after 'to'", () => {
    expect(isWithinDateRange("2026-08-25T08:00:00.000Z", undefined, "2026-08-24")).toBe(false)
  })

  it("excludes a record created before 'from'", () => {
    expect(isWithinDateRange("2026-08-01T08:00:00.000Z", "2026-08-10")).toBe(false)
  })

  it("includes a record on the 'from' boundary itself", () => {
    expect(isWithinDateRange("2026-08-10T00:00:00.000Z", "2026-08-10")).toBe(true)
  })

  it("respects both bounds together", () => {
    expect(isWithinDateRange("2026-08-15T08:00:00.000Z", "2026-08-10", "2026-08-20")).toBe(true)
    expect(isWithinDateRange("2026-08-25T08:00:00.000Z", "2026-08-10", "2026-08-20")).toBe(false)
  })

  it("accepts a Date instance", () => {
    expect(isWithinDateRange(new Date("2026-08-24T14:00:00.000Z"), undefined, "2026-08-24")).toBe(true)
  })

  it("treats unparseable values as not matching a bounded range", () => {
    expect(isWithinDateRange("not a date", "2026-08-01", "2026-08-31")).toBe(false)
    expect(isWithinDateRange(null, "2026-08-01")).toBe(false)
    expect(isWithinDateRange(undefined, "2026-08-01")).toBe(false)
  })
})
