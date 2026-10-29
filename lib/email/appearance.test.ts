import { describe, expect, it } from "vitest"
import {
  EMAIL_INLINE_FONT_SIZE_OPTIONS,
  EMAIL_LINE_HEIGHT_LABELS,
  EMAIL_LINE_HEIGHT_OPTIONS,
  isEmailInlineFontSize,
  isEmailLineHeight,
  toEmailInlineFontFamilyLoose,
  toEmailInlineFontSizeLoose,
  toEmailLineHeight,
} from "./appearance"

describe("toEmailInlineFontSizeLoose", () => {
  it.each([
    ["12pt", "16px"],
    ["11pt", "15px"],
    ["10pt", "13px"],
    ["10.0pt", "13px"],
    ["13.3333px", "13px"],
    ["14px", "14px"],
    ["19px", "18px"],
  ])("maps %s to %s", (value, expected) => {
    expect(toEmailInlineFontSizeLoose(value)).toBe(expected)
  })

  it.each(["2em", "medium", "72px", "4pt", "", "12"])("rejects %j", (value) => {
    expect(toEmailInlineFontSizeLoose(value)).toBeNull()
  })
})

describe("toEmailInlineFontFamilyLoose", () => {
  it.each([
    ["Calibri, sans-serif", "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif"],
    ['"Verdana", sans-serif', "Verdana, Geneva, sans-serif"],
    ["'times new roman', serif", "'Times New Roman', Times, serif"],
    ["Verdana, Geneva, sans-serif", "Verdana, Geneva, sans-serif"],
  ])("maps %s to its stack", (value, expected) => {
    expect(toEmailInlineFontFamilyLoose(value)).toBe(expected)
  })

  it("rejects a family we don't offer", () => {
    expect(toEmailInlineFontFamilyLoose('"Segoe UI Emoji", sans-serif')).toBeNull()
  })
})

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
