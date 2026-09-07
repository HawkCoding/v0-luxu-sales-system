import { describe, expect, it } from "vitest"
import {
  formatPrimaryProductDuration,
  isJourneyRouteKind,
  primaryProductDurationCount,
  primaryProductOf,
} from "@/lib/enquiry/primary-product"

describe("primaryProductOf", () => {
  it("falls back to a rail journey when the kind is not known yet", () => {
    expect(primaryProductOf(null).bookingNoun).toBe("Journey")
    expect(primaryProductOf(undefined).bookingNoun).toBe("Journey")
  })

  it("returns the kind's own primary-product rules", () => {
    expect(primaryProductOf("tour_operator").bookingNoun).toBe("Tour")
    expect(primaryProductOf("hotel_property").bookingNoun).toBe("Stay")
  })
})

describe("isJourneyRouteKind", () => {
  it("is true only for kinds whose route is a real origin/destination", () => {
    expect(isJourneyRouteKind("train_operator")).toBe(true)
    expect(isJourneyRouteKind("tour_operator")).toBe(false)
    expect(isJourneyRouteKind("hotel_property")).toBe(false)
    expect(isJourneyRouteKind(null)).toBe(false)
  })
})

describe("primaryProductDurationCount", () => {
  it("counts both end days for a day-counting kind (F-P3-4)", () => {
    // 20 -> 23 November is a 3-night interval and a 4-Day Kruger Safari.
    expect(primaryProductDurationCount(3, "days")).toBe(4)
  })

  it("leaves a night-counting kind's span unchanged", () => {
    expect(primaryProductDurationCount(3, "nights")).toBe(3)
  })

  it("returns the raw night count for a kind with no duration unit", () => {
    expect(primaryProductDurationCount(3, null)).toBe(3)
  })
})

describe("formatPrimaryProductDuration", () => {
  it("renders a day-counting kind's inclusive span", () => {
    expect(formatPrimaryProductDuration(3, "days")).toBe("4 days")
    expect(formatPrimaryProductDuration(0, "days")).toBe("1 day")
  })

  it("renders a night-counting kind's span", () => {
    expect(formatPrimaryProductDuration(2, "nights")).toBe("2 nights")
    expect(formatPrimaryProductDuration(1, "nights")).toBe("1 night")
  })
})
