import { describe, expect, it } from "vitest"
import {
  getSessionTimeoutWarningMinutes,
  parseSessionTimeoutMinutes,
} from "./session-timeout"

describe("parseSessionTimeoutMinutes", () => {
  it("falls back to 30 minutes for missing or invalid values", () => {
    expect(parseSessionTimeoutMinutes(null)).toBe(30)
    expect(parseSessionTimeoutMinutes("not-a-number")).toBe(30)
  })

  it("rounds and clamps values inside the allowed range", () => {
    expect(parseSessionTimeoutMinutes("44.6")).toBe(45)
    expect(parseSessionTimeoutMinutes("2")).toBe(5)
    expect(parseSessionTimeoutMinutes("999")).toBe(480)
  })
})

describe("getSessionTimeoutWarningMinutes", () => {
  it("caps the warning window sensibly for short and long timeouts", () => {
    expect(getSessionTimeoutWarningMinutes(5)).toBe(1)
    expect(getSessionTimeoutWarningMinutes(30)).toBe(5)
    expect(getSessionTimeoutWarningMinutes(480)).toBe(5)
  })
})
