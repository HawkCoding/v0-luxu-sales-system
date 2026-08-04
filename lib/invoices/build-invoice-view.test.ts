import { describe, expect, it } from "vitest"
import { buildDaysLabel, resolveDurationNights } from "@/lib/invoices/build-invoice-view"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"

function trainBlock(durationDays: number | null, displayOrder = 0): VoucherServiceBlock {
  return {
    serviceType: "train",
    title: "Rovos Rail",
    contactDetails: {},
    displayOrder,
    serviceData: { durationDays },
  }
}

describe("resolveDurationNights", () => {
  it("prefers the trip start/end date range", () => {
    const nights = resolveDurationNights(
      { trip_start_date: "2026-12-27", trip_end_date: "2026-12-29", duration_nights: null },
      [trainBlock(1)],
    )
    expect(nights).toBe(2)
  })

  it("falls back to the outbound train route's duration_days when the trip range is unset", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: null },
      [trainBlock(3)],
    )
    expect(nights).toBe(2)
  })

  it("falls back to the legacy duration_nights column when nothing else is available", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: 4 },
      [],
    )
    expect(nights).toBe(4)
  })

  it("returns null when no source has a usable value", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: null },
      [trainBlock(null)],
    )
    expect(nights).toBeNull()
  })

  it("ignores an inverted or same-day trip range and falls through to the next source", () => {
    const nights = resolveDurationNights(
      { trip_start_date: "2026-12-29", trip_end_date: "2026-12-29", duration_nights: null },
      [trainBlock(3)],
    )
    expect(nights).toBe(2)
  })

  it("uses the earliest-ordered train block when there are multiple legs", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: null },
      [trainBlock(5, 1), trainBlock(2, 0)],
    )
    expect(nights).toBe(1)
  })
})

describe("buildDaysLabel", () => {
  it("formats a plural nights/days label", () => {
    expect(buildDaysLabel(2)).toBe("2 Nights / 3 Days")
  })

  it("formats the singular night correctly", () => {
    expect(buildDaysLabel(1)).toBe("1 Night / 2 Days")
  })

  it("returns null for a missing or non-positive duration", () => {
    expect(buildDaysLabel(null)).toBeNull()
    expect(buildDaysLabel(0)).toBeNull()
  })
})
