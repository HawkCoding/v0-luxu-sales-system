import { describe, expect, it } from "vitest"
import { getCalendarNavMonthBounds, getWideCalendarYearBounds } from "./calendar"

describe("getCalendarNavMonthBounds", () => {
  it("spans one year before to three years after the reference year", () => {
    const { startMonth, endMonth } = getCalendarNavMonthBounds(2026)

    expect(startMonth.getFullYear()).toBe(2025)
    expect(startMonth.getMonth()).toBe(0)
    expect(endMonth.getFullYear()).toBe(2029)
    expect(endMonth.getMonth()).toBe(11)
  })
})

describe("getWideCalendarYearBounds", () => {
  it("spans 10 years before and after the reference year", () => {
    expect(getWideCalendarYearBounds(2026)).toEqual({ fromYear: 2016, toYear: 2036 })
  })
})
