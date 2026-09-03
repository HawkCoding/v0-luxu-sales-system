import { describe, expect, it } from "vitest"
import { isPlaceholderToken } from "@/lib/templates/resolve-shared-tokens"

/**
 * The quote, voucher and thank-you emails each override `direction`/`routeName` with their own
 * wording, and used to fall straight from "no quoted route" to the literal "your journey" -- which
 * threw away the shared resolver's answer. On a standalone stay (Kruger Shalati) that answer is the
 * stay's length, so a client was emailed "On the your journey departure, 20 November 2025".
 *
 * They now fall through to the shared token, guarded by this predicate so a booking that genuinely
 * resolved nothing still reads "your journey" rather than an em dash.
 */
describe("isPlaceholderToken", () => {
  it("treats the em-dash placeholder as nothing", () => {
    expect(isPlaceholderToken("—")).toBe(true)
    expect(isPlaceholderToken("  —  ")).toBe(true)
  })

  it("treats blank and absent values as nothing", () => {
    expect(isPlaceholderToken("")).toBe(true)
    expect(isPlaceholderToken("   ")).toBe(true)
    expect(isPlaceholderToken(null)).toBe(true)
    expect(isPlaceholderToken(undefined)).toBe(true)
  })

  it("keeps a real route name", () => {
    expect(isPlaceholderToken("Pretoria ↔ Cape Town")).toBe(false)
  })

  // What a standalone stay resolves to in place of a direction.
  it("keeps a stay length", () => {
    expect(isPlaceholderToken("2 Nights")).toBe(false)
    expect(isPlaceholderToken("1 Night")).toBe(false)
  })
})
