import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import {
  derivePerPersonRate,
  formatJourneyRange,
  formatPaxLabel,
  formatTotalLabel,
  resolveJourneyDates,
  summarizeServiceBlock,
} from "./quote-presentation"

describe("formatPaxLabel", () => {
  it("pluralizes adults and children", () => {
    expect(formatPaxLabel({ adults: 2, children: 0 })).toBe("2 Adults")
    expect(formatPaxLabel({ adults: 1, children: 0 })).toBe("1 Adult")
    expect(formatPaxLabel({ adults: 2, children: 1 })).toBe("2 Adults + 1 Child")
    expect(formatPaxLabel({ adults: 1, children: 2 })).toBe("1 Adult + 2 Children")
  })

  it("returns empty string when both counts are zero", () => {
    expect(formatPaxLabel({ adults: 0, children: 0 })).toBe("")
  })
})

describe("derivePerPersonRate", () => {
  it("divides total by adults for adults-only bookings", () => {
    expect(derivePerPersonRate(86300, { adults: 2, children: 0 })).toBe(43150)
  })

  it("rounds to cents", () => {
    expect(derivePerPersonRate(100, { adults: 3, children: 0 })).toBe(33.33)
  })

  it("returns null when children are present or adults is zero", () => {
    expect(derivePerPersonRate(86300, { adults: 2, children: 1 })).toBeNull()
    expect(derivePerPersonRate(86300, { adults: 0, children: 0 })).toBeNull()
  })
})

describe("formatTotalLabel", () => {
  it("includes the pax label when known", () => {
    expect(formatTotalLabel({ adults: 2, children: 0 })).toBe("TOTAL for 2 Adults")
    expect(formatTotalLabel({ adults: 0, children: 0 })).toBe("TOTAL")
  })
})

describe("resolveJourneyDates", () => {
  it("prefers trip dates over departure date", () => {
    expect(
      resolveJourneyDates({
        trip_start_date: "2026-07-18",
        trip_end_date: "2026-07-22",
        departure_date: "2026-07-20",
        duration_nights: null,
      }),
    ).toEqual({ start: "2026-07-18", end: "2026-07-22" })
  })

  it("falls back to departure date plus duration nights", () => {
    expect(
      resolveJourneyDates({
        trip_start_date: null,
        trip_end_date: null,
        departure_date: "2026-07-20",
        duration_nights: 2,
      }),
    ).toEqual({ start: "2026-07-20", end: "2026-07-22" })
  })

  it("returns nulls when nothing is set", () => {
    expect(
      resolveJourneyDates({
        trip_start_date: null,
        trip_end_date: null,
        departure_date: null,
        duration_nights: 3,
      }),
    ).toEqual({ start: null, end: null })
  })
})

describe("formatJourneyRange", () => {
  it("collapses same-month ranges", () => {
    expect(formatJourneyRange("2026-07-18", "2026-07-22")).toBe("18 – 22 July 2026")
  })

  it("spells out cross-month ranges", () => {
    expect(formatJourneyRange("2026-07-28", "2026-08-02")).toBe("28 July – 2 August 2026")
  })

  it("spells out cross-year ranges in full", () => {
    expect(formatJourneyRange("2026-12-28", "2027-01-03")).toBe(
      "28 December 2026 – 3 January 2027",
    )
  })

  it("shows start only when end is missing or equal", () => {
    expect(formatJourneyRange("2026-07-18", null)).toBe("18 July 2026")
    expect(formatJourneyRange("2026-07-18", "2026-07-18")).toBe("18 July 2026")
  })

  it("returns null without a start date", () => {
    expect(formatJourneyRange(null, "2026-07-22")).toBeNull()
  })
})

describe("summarizeServiceBlock", () => {
  const baseBlock: VoucherServiceBlock = {
    serviceType: "train",
    title: "Blue Train",
    contactDetails: { name: "Blue Train Co" },
    serviceData: {},
    displayOrder: 1,
  }

  it("collects date, title, and populated details", () => {
    const line = summarizeServiceBlock({
      ...baseBlock,
      serviceData: {
        departureDate: "2026-07-20",
        route: "Pretoria to Cape Town",
        suiteType: "Deluxe Suite",
        nights: 2,
      },
    })
    expect(line.dateISO).toBe("2026-07-20")
    expect(line.title).toBe("Blue Train")
    expect(line.details).toEqual([
      "Blue Train Co",
      "Pretoria to Cape Town",
      "Deluxe Suite",
      "2 nights",
    ])
  })

  it("falls back to the service-type label when title is empty", () => {
    const line = summarizeServiceBlock({ ...baseBlock, title: "" })
    expect(line.title).toBe("Train Service")
  })

  it("joins pickup and dropoff for transfers", () => {
    const line = summarizeServiceBlock({
      ...baseBlock,
      serviceType: "transfer",
      title: "Transfer",
      contactDetails: {},
      serviceData: { pickup: "Hotel", dropoff: "Station" },
    })
    expect(line.details).toContain("Hotel to Station")
    expect(line.dateISO).toBeNull()
  })
})
