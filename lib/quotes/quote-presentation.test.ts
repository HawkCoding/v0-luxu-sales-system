import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import {
  buildQuoteItineraryLines,
  collectQuoteExclusions,
  deriveJourneyFromBlocks,
  derivePerPersonRate,
  formatJourneyRange,
  formatPaxLabel,
  formatTimeOfDay,
  formatTotalLabel,
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

describe("deriveJourneyFromBlocks", () => {
  it("spans earliest departure to latest arrival across blocks", () => {
    expect(deriveJourneyFromBlocks([trainBlock, hotelBlock])).toEqual({
      start: "2026-07-18",
      end: "2026-07-22",
    })
  })

  it("uses a departure date when a block carries no arrival date", () => {
    expect(
      deriveJourneyFromBlocks([
        {
          ...hotelBlock,
          serviceData: { ...hotelBlock.serviceData, arrivalDate: null },
        },
      ]),
    ).toEqual({ start: "2026-07-18", end: "2026-07-18" })
  })

  it("returns null when no block carries a date", () => {
    expect(
      deriveJourneyFromBlocks([
        {
          ...hotelBlock,
          serviceData: { ...hotelBlock.serviceData, departureDate: null, arrivalDate: null },
        },
      ]),
    ).toBeNull()
    expect(deriveJourneyFromBlocks([])).toBeNull()
  })
})

describe("formatJourneyRange", () => {
  it("collapses same-month ranges", () => {
    expect(formatJourneyRange("2026-07-18", "2026-07-22")).toBe("18 – 22 July 2026")
  })

  it("spells out cross-month ranges", () => {
    expect(formatJourneyRange("2026-07-28", "2026-08-02")).toBe("28 July – 02 August 2026")
  })

  it("spells out cross-year ranges in full", () => {
    expect(formatJourneyRange("2026-12-28", "2027-01-03")).toBe(
      "28 December 2026 – 03 January 2027",
    )
  })

  it("zero-pads single-digit days on both sides of a range", () => {
    expect(formatJourneyRange("2026-07-01", "2026-07-05")).toBe("01 – 05 July 2026")
    expect(formatJourneyRange("2026-07-08", "2026-08-03")).toBe("08 July – 03 August 2026")
  })

  it("shows start only when end is missing or equal", () => {
    expect(formatJourneyRange("2026-07-18", null)).toBe("18 July 2026")
    expect(formatJourneyRange("2026-07-18", "2026-07-18")).toBe("18 July 2026")
    expect(formatJourneyRange("2026-07-04", null)).toBe("04 July 2026")
  })

  it("returns null without a start date", () => {
    expect(formatJourneyRange(null, "2026-07-22")).toBeNull()
  })
})

describe("formatTimeOfDay", () => {
  it("renders house style", () => {
    expect(formatTimeOfDay("14:00")).toBe("14h00")
    expect(formatTimeOfDay("09:30:00")).toBe("09h30")
  })

  it("returns null when unset", () => {
    expect(formatTimeOfDay(null)).toBeNull()
    expect(formatTimeOfDay("")).toBeNull()
  })
})

const hotelBlock: VoucherServiceBlock = {
  serviceType: "hotel",
  title: "Irene Country Lodge",
  contactDetails: { name: "Irene Country Lodge", location: "Pretoria" },
  serviceData: {
    departureDate: "2026-07-18",
    arrivalDate: "2026-07-20",
    startTime: "14:00",
    endTime: "10:00",
    roomType: "Guest room with a lake view",
    mealPlan: "breakfast",
    nights: 2,
  },
  displayOrder: 1,
}

const trainBlock: VoucherServiceBlock = {
  serviceType: "train",
  title: "Blue Train",
  contactDetails: { name: "Blue Train", location: "Cape Town" },
  serviceData: {
    departureDate: "2026-07-20",
    arrivalDate: "2026-07-22",
    startTime: "12:00",
    endTime: "18:00",
    route: "Pretoria to Cape Town",
    suiteType: "Deluxe Suite",
    durationDays: 3,
    inclusions: ["High Tea", "Wi-Fi"],
    exclusions: ["French Champagne, caviar, and gratuities"],
  },
  displayOrder: 2,
}

describe("buildQuoteItineraryLines", () => {
  it("writes a hotel stay as a check-in sentence plus a dated check-out line", () => {
    const lines = buildQuoteItineraryLines([hotelBlock])

    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      dateISO: "2026-07-18",
      text: "Two nights at Irene Country Lodge, Pretoria in a Guest room with a lake view incl. breakfast | Check in from 14h00",
      bullets: [],
    })
    expect(lines[1]).toEqual({
      dateISO: "2026-07-20",
      text: "Check out at 10h00",
      bullets: [],
    })
  })

  it("derives nights on board from durationDays and lists supplier inclusions as bullets", () => {
    const [boarding, arrival] = buildQuoteItineraryLines([trainBlock])

    expect(boarding.text).toBe(
      "Two nights on the Blue Train in a Deluxe Suite on an all-inclusive basis — Pretoria to Cape Town | Departs at 12h00",
    )
    expect(boarding.bullets).toEqual(["High Tea", "Wi-Fi"])
    expect(arrival).toEqual({
      dateISO: "2026-07-22",
      text: "Arrival at Cape Town station at 18h00",
      bullets: ["Train arrival times cannot be guaranteed"],
    })
  })

  it("interleaves lines from different blocks by date", () => {
    const dates = buildQuoteItineraryLines([trainBlock, hotelBlock]).map((line) => line.dateISO)
    expect(dates).toEqual(["2026-07-18", "2026-07-20", "2026-07-20", "2026-07-22"])
  })

  it("names pickup and dropoff on a transfer", () => {
    const [line] = buildQuoteItineraryLines([
      {
        serviceType: "transfer",
        title: "Transfer",
        contactDetails: { name: "Luxus Chauffeur" },
        serviceData: { departureDate: "2026-07-20", startTime: "10:00", pickup: "the hotel", dropoff: "the station" },
        displayOrder: 1,
      },
    ])
    expect(line.text).toBe("Luxus Chauffeur transfer from the hotel to the station | at 10h00")
  })

  it("omits the closing line when there is no end date", () => {
    const lines = buildQuoteItineraryLines([
      { ...hotelBlock, serviceData: { ...hotelBlock.serviceData, arrivalDate: null } },
    ])
    expect(lines).toHaveLength(1)
  })
})

describe("collectQuoteExclusions", () => {
  it("dedupes supplier exclusions and appends the standing one last", () => {
    const exclusions = collectQuoteExclusions(
      [trainBlock, { ...trainBlock, displayOrder: 3 }],
      "Services not mentioned.",
    )
    expect(exclusions).toEqual([
      "French Champagne, caviar, and gratuities",
      "Services not mentioned.",
    ])
  })

  it("omits the standing exclusion when it is empty", () => {
    expect(collectQuoteExclusions([hotelBlock], "")).toEqual([])
  })
})
