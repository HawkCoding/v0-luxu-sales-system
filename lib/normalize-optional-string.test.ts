import { describe, expect, it } from "vitest"
import { normalizeOptionalString } from "./normalize-optional-string"

describe("normalizeOptionalString", () => {
  it("returns null for undefined and null", () => {
    expect(normalizeOptionalString(undefined)).toBeNull()
    expect(normalizeOptionalString(null)).toBeNull()
  })

  it("returns null for whitespace-only values", () => {
    expect(normalizeOptionalString("")).toBeNull()
    expect(normalizeOptionalString("   ")).toBeNull()
    expect(normalizeOptionalString("\n\t")).toBeNull()
  })

  it("trims and returns non-empty values", () => {
    expect(normalizeOptionalString("Alice")).toBe("Alice")
    expect(normalizeOptionalString("  Alice  ")).toBe("Alice")
  })
})
