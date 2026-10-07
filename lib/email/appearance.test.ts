import { describe, expect, it } from "vitest"
import {
  EMAIL_INLINE_FONT_SIZE_OPTIONS,
  EMAIL_LINE_HEIGHT_LABELS,
  EMAIL_LINE_HEIGHT_OPTIONS,
  isEmailInlineFontSize,
  isEmailLineHeight,
  toEmailLineHeight,
} from "./appearance"

describe("EMAIL_INLINE_FONT_SIZE_OPTIONS", () => {
  it("offers every px step from 10 to 16, then the larger steps, in ascending order", () => {
    expect(EMAIL_INLINE_FONT_SIZE_OPTIONS).toEqual([
      "10px", "11px", "12px", "13px", "14px", "15px", "16px", "18px", "20px", "24px", "28px", "32px",
    ])
  })

  it.each(["11px", "13px", "15px"])("accepts the in-between %s size", (size) => {
    expect(isEmailInlineFontSize(size)).toBe(true)
  })

  it.each(["9px", "17px", "13", "13pt", "13px;color:red", "", null, undefined])("rejects %s", (value) => {
    expect(isEmailInlineFontSize(value)).toBe(false)
  })
})

describe("email line height allowlist", () => {
  it("offers Single, 1.15, 1.5 and Double", () => {
    expect(EMAIL_LINE_HEIGHT_OPTIONS.map((value) => EMAIL_LINE_HEIGHT_LABELS[value])).toEqual([
      "Single",
      "1.15",
      "1.5",
      "Double",
    ])
  })

  it.each(["1", "1.15", "1.5", "2"])("accepts %s", (value) => {
    expect(isEmailLineHeight(value)).toBe(true)
    expect(toEmailLineHeight(value)).toBe(value)
  })

  it("normalises surrounding whitespace to the canonical option", () => {
    expect(toEmailLineHeight(" 1.5 ")).toBe("1.5")
  })

  it.each([
    "1.4",
    "3",
    "1.0",
    "150%",
    "24px",
    "normal",
    "1.5; background:url(evil)",
    "expression(alert(1))",
    "",
    null,
    undefined,
  ])("rejects %s", (value) => {
    expect(isEmailLineHeight(value)).toBe(false)
    expect(toEmailLineHeight(value)).toBeNull()
  })
})
