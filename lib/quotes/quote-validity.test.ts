import { describe, expect, it } from "vitest"
import {
  buildQuickOptions,
  DEFAULT_QUOTE_VALIDITY_DAYS,
  isoDateDaysFromNow,
  resolveValidityDays,
} from "./quote-validity"

describe("isoDateDaysFromNow", () => {
  it("adds the given number of days to the reference date", () => {
    const from = new Date("2026-01-01T00:00:00.000Z")
    expect(isoDateDaysFromNow(7, from)).toBe("2026-01-08")
    expect(isoDateDaysFromNow(30, from)).toBe("2026-01-31")
    expect(isoDateDaysFromNow(90, from)).toBe("2026-04-01")
  })
})

describe("resolveValidityDays", () => {
  it("falls back to the default when the setting is unset", () => {
    expect(resolveValidityDays(null)).toBe(DEFAULT_QUOTE_VALIDITY_DAYS)
    expect(resolveValidityDays(undefined)).toBe(DEFAULT_QUOTE_VALIDITY_DAYS)
  })

  it("parses a numeric setting value", () => {
    expect(resolveValidityDays("30")).toBe(30)
  })

  it("falls back to the default for an invalid setting value", () => {
    expect(resolveValidityDays("not-a-number")).toBe(DEFAULT_QUOTE_VALIDITY_DAYS)
  })
})

describe("buildQuickOptions", () => {
  it("marks the matching option when the org default equals a fixed option exactly", () => {
    const options = buildQuickOptions(30)
    expect(options).toEqual([
      { days: 7, isOrgDefault: false },
      { days: 30, isOrgDefault: true },
      { days: 90, isOrgDefault: false },
    ])
  })

  it("replaces the closest fixed option with the org default", () => {
    const options = buildQuickOptions(21)
    expect(options).toEqual([
      { days: 7, isOrgDefault: false },
      { days: 21, isOrgDefault: true },
      { days: 90, isOrgDefault: false },
    ])
  })

  it("breaks a tie by replacing the smaller option", () => {
    const options = buildQuickOptions(60)
    expect(options).toEqual([
      { days: 7, isOrgDefault: false },
      { days: 60, isOrgDefault: true },
      { days: 90, isOrgDefault: false },
    ])
  })
})
