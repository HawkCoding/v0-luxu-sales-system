import { describe, expect, it } from "vitest"

import { isPlausiblePhone } from "./phone-format"

describe("isPlausiblePhone", () => {
  it("accepts the formats real customers arrive in", () => {
    expect(isPlausiblePhone("+27 82 555 0202")).toBe(true)
    expect(isPlausiblePhone("+1 555 000 0000")).toBe(true)
    expect(isPlausiblePhone("(011) 555-0202")).toBe(true)
    expect(isPlausiblePhone("011 555 0202")).toBe(true)
    expect(isPlausiblePhone("+44 20 7946 0958")).toBe(true)
    expect(isPlausiblePhone("082.555.0202")).toBe(true)
    expect(isPlausiblePhone("+27 21 555 0100/1")).toBe(true)
    expect(isPlausiblePhone("  +27825550202  ")).toBe(true)
  })

  it("rejects free text and implausible digit counts", () => {
    expect(isPlausiblePhone("((((not a phone))))###")).toBe(false)
    expect(isPlausiblePhone("call me")).toBe(false)
    expect(isPlausiblePhone("12345")).toBe(false)
    expect(isPlausiblePhone("123456789012345678901")).toBe(false)
    expect(isPlausiblePhone("")).toBe(false)
    expect(isPlausiblePhone("   ")).toBe(false)
  })

  it("only allows a plus sign in the leading position", () => {
    expect(isPlausiblePhone("+27825550202")).toBe(true)
    expect(isPlausiblePhone("027+8255502")).toBe(false)
  })
})
