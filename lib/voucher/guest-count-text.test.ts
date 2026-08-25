import { describe, expect, it } from "vitest"
import { formatGuestCountText } from "./guest-count-text"

describe("formatGuestCountText", () => {
  it("joins all three buckets with a comma then an ampersand", () => {
    expect(formatGuestCountText({ adultCount: 2, childCount: 1, infantCount: 2 })).toBe(
      "2 adults, 1 child & 2 infants",
    )
  })

  it("renders adults only", () => {
    expect(formatGuestCountText({ adultCount: 2, childCount: 0, infantCount: 0 })).toBe("2 adults")
  })

  it("renders adults and infants, skipping the empty children bucket", () => {
    expect(formatGuestCountText({ adultCount: 2, childCount: 0, infantCount: 1 })).toBe("2 adults & 1 infant")
  })

  it("singularises a solo adult", () => {
    expect(formatGuestCountText({ adultCount: 1, childCount: 0, infantCount: 0 })).toBe("1 adult")
  })

  it("singularises a solo child and infant alongside plural adults", () => {
    expect(formatGuestCountText({ adultCount: 2, childCount: 1, infantCount: 1 })).toBe(
      "2 adults, 1 child & 1 infant",
    )
  })

  it("falls back to a defensive message when every bucket is empty", () => {
    expect(formatGuestCountText({ adultCount: 0, childCount: 0, infantCount: 0 })).toBe("No guests")
  })
})
