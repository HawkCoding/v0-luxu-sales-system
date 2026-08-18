import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"
import type { QuoteLineItem } from "@/lib/types"
import {
  buildQuoteItineraryLines,
  collectQuoteExclusions,
  deriveFlightCapPerPerson,
  deriveJourneyFromBlocks,
  derivePerPersonRate,
  formatFlightCapLine,
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
    route: "Pretoria → Cape Town",
    arrivalStation: "Cape Town",
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
      text: "Two nights at the Irene Country Lodge, Pretoria in a Guest room with a lake view incl. breakfast | Check in from 14h00",
      bullets: [],
    })
    expect(lines[1]).toEqual({
      dateISO: "2026-07-20",
      text: "Check out at 10h00",
      bullets: [],
    })
  })

  it("appends a COMPLIMENTARY callout to a hotel line marked complimentary", () => {
    const lines = buildQuoteItineraryLines([
      { ...hotelBlock, serviceData: { ...hotelBlock.serviceData, isComplimentary: true } },
    ])

    expect(lines[0].text).toBe(
      "Two nights at the Irene Country Lodge, Pretoria in a Guest room with a lake view incl. breakfast | Check in from 14h00 – COMPLIMENTARY",
    )
  })

  it("calls out a gifted first night without shortening the stay it states", () => {
    const lines = buildQuoteItineraryLines([
      { ...hotelBlock, serviceData: { ...hotelBlock.serviceData, isFirstNightComplimentary: true } },
    ])

    expect(lines[0].text).toBe(
      "Two nights at the Irene Country Lodge, Pretoria in a Guest room with a lake view incl. breakfast | Check in from 14h00 – FIRST NIGHT COMPLIMENTARY",
    )
  })

  it("derives nights on board from durationDays and lists supplier inclusions as bullets", () => {
    const [boarding, arrival] = buildQuoteItineraryLines([trainBlock])

    expect(boarding.text).toBe(
      "Two nights on the Blue Train in a Deluxe Suite on an all-inclusive basis — Pretoria to Cape Town | Departs at 12h00",
    )
    expect(boarding.bullets).toEqual([
      { kind: "item", text: "High Tea" },
      { kind: "item", text: "Wi-Fi" },
    ])
    expect(arrival).toEqual({
      dateISO: "2026-07-22",
      text: "Arrival at Cape Town station at 18h00",
      bullets: [{ kind: "item", text: "Train arrival times cannot be guaranteed" }],
    })
  })

  it("marks a `#` inclusion as a subheading and strips the marker", () => {
    const [boarding] = buildQuoteItineraryLines([
      {
        ...trainBlock,
        serviceData: {
          ...trainBlock.serviceData,
          inclusions: ["# Onboard", "High Tea", "# Off-train", "Vehicle transfer"],
        },
      },
    ])

    expect(boarding.bullets).toEqual([
      { kind: "heading", text: "Onboard" },
      { kind: "item", text: "High Tea" },
      { kind: "heading", text: "Off-train" },
      { kind: "item", text: "Vehicle transfer" },
    ])
  })

  it("interleaves lines from different blocks by date", () => {
    const dates = buildQuoteItineraryLines([trainBlock, hotelBlock]).map((line) => line.dateISO)
    expect(dates).toEqual(["2026-07-18", "2026-07-20", "2026-07-20", "2026-07-22"])
  })

  it("prints a station transfer before the hotel it delivers guests to, even though the hotel's default check-in time is earlier on the clock", () => {
    // Regression for the reported bug: train arrives 25 Nov 18h00, the transfer that carries
    // guests from the station to the hotel also runs 25 Nov 18h00, and the hotel's check-in is
    // just its default policy time (15h00) — not a real event. Builder order (train, transfer,
    // hotel) has to win the same-day tie, or the hotel line prints before the transfer that gets
    // guests there.
    const train: VoucherServiceBlock = {
      serviceType: "train",
      title: "Blue Train",
      contactDetails: { name: "Blue Train", location: "Pretoria" },
      serviceData: {
        departureDate: "2026-11-23",
        arrivalDate: "2026-11-25",
        startTime: "13:00",
        endTime: "18:00",
        route: "Pretoria → Cape Town",
        arrivalStation: "Cape Town",
        durationDays: 3,
      },
      displayOrder: 0,
    }
    const transfer: VoucherServiceBlock = {
      serviceType: "transfer",
      title: "Transfer",
      contactDetails: { name: "Luxus Chauffeur" },
      serviceData: {
        departureDate: "2026-11-25",
        startTime: "18:00",
        pickup: "the Cape Town Station",
        dropoff: "the TAJ Hotel",
      },
      displayOrder: 1,
    }
    const hotel: VoucherServiceBlock = {
      serviceType: "hotel",
      title: "TAJ Hotel",
      contactDetails: { name: "TAJ Hotel", location: "Cape Town" },
      serviceData: {
        departureDate: "2026-11-25",
        arrivalDate: "2026-11-27",
        startTime: "15:00",
        endTime: "12:00",
        roomType: "Luxury City View Room",
        mealPlan: "Bed & Breakfast",
        nights: 2,
      },
      displayOrder: 2,
    }

    // Deliberately passed out of builder order to prove the sort — not the input order — decides.
    const sorted = sortItineraryBlocksChronologically([hotel, train, transfer])
    const lines = buildQuoteItineraryLines(sorted)
    const nov25 = lines.filter((line) => line.dateISO === "2026-11-25").map((line) => line.text)

    expect(nov25).toEqual([
      "Arrival at Cape Town station at 18h00",
      "Transfer from the Cape Town Station to the TAJ Hotel | at 18h00",
      "Two nights at the TAJ Hotel, Cape Town in a Luxury City View Room incl. Bed & Breakfast | Check in from 15h00",
    ])
    expect(lines.find((line) => line.text === "Check out at 12h00")?.dateISO).toBe("2026-11-27")
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
    expect(line.text).toBe("Transfer from the hotel to the station | at 10h00")
  })

  it("names the booked itinerary on a tour and leads its bullets with the itinerary's copy", () => {
    const [line] = buildQuoteItineraryLines([
      {
        serviceType: "tour",
        title: "City Sightseeing",
        contactDetails: { name: "City Sightseeing", location: "Cape Town" },
        serviceData: {
          departureDate: "2026-07-19",
          startTime: "09:00",
          suiteType: "Classic Hop-on-Hop-off Ticket",
          itinerary: "Cape Town - One Day Pass",
          itineraryDescription: "Red route, 15 stops, hop off as often as you like.",
          inclusions: ["Audio guide"],
        },
        displayOrder: 1,
      },
    ])

    expect(line.text).toBe(
      "City Sightseeing in Cape Town — Cape Town - One Day Pass | at 09h00",
    )
    expect(line.bullets).toEqual([
      { kind: "item", text: "Red route, 15 stops, hop off as often as you like." },
      { kind: "item", text: "Audio guide" },
    ])
  })

  it("omits the closing line when there is no end date", () => {
    const lines = buildQuoteItineraryLines([
      { ...hotelBlock, serviceData: { ...hotelBlock.serviceData, arrivalDate: null } },
    ])
    expect(lines).toHaveLength(1)
  })
})

const flightBlock: VoucherServiceBlock = {
  serviceType: "airline",
  title: "Flight",
  contactDetails: { name: "SA Airways" },
  serviceData: {
    departureDate: "2026-07-17",
    startTime: "08:00",
    flightNumber: "SA123",
    route: "Johannesburg → Cape Town",
    cabin: "Economy",
  },
  displayOrder: 0,
}

describe("buildQuoteItineraryLines — flights", () => {
  const sameDayFlight: VoucherServiceBlock = {
    ...flightBlock,
    serviceData: {
      ...flightBlock.serviceData,
      departureDate: "2026-10-14",
      arrivalDate: "2026-10-14",
      startTime: "10:00",
      endTime: "12:15",
      route: "Lanseria INT Airport → Cape Town INT Airport",
      flightNumber: "FA212",
      arrivalAirportCode: "CPT",
    },
  }

  it("folds a same-day arrival into the departure sentence", () => {
    const lines = buildQuoteItineraryLines([sameDayFlight])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({
      dateISO: "2026-10-14",
      text: "Flight with SA Airways FA212 — Lanseria INT Airport to Cape Town INT Airport in Economy | departing at 10h00 for arrival at 12h15",
      bullets: [],
    })
  })

  it("gives an overnight flight its own dated arrival line", () => {
    const lines = buildQuoteItineraryLines([
      {
        ...sameDayFlight,
        serviceData: { ...sameDayFlight.serviceData, arrivalDate: "2026-10-15", startTime: "22:40", endTime: "06:15" },
      },
    ])

    expect(lines).toHaveLength(2)
    // The arrival time must not appear under the departure date, where it would read as same-day.
    expect(lines[0].text).toBe(
      "Flight with SA Airways FA212 — Lanseria INT Airport to Cape Town INT Airport in Economy | departing at 22h40",
    )
    expect(lines[1]).toEqual({
      dateISO: "2026-10-15",
      text: "Flight arrives at CPT at 06h15",
      bullets: [],
    })
  })

  it("states the departure alone when no arrival has been captured", () => {
    const lines = buildQuoteItineraryLines([
      { ...sameDayFlight, serviceData: { ...sameDayFlight.serviceData, arrivalDate: null, endTime: null } },
    ])

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toContain("| departing at 10h00")
    expect(lines[0].text).not.toContain("arrival")
  })

  it("prints no schedule at all for a flight captured before flight times existed", () => {
    const lines = buildQuoteItineraryLines([
      {
        ...sameDayFlight,
        serviceData: { ...sameDayFlight.serviceData, startTime: null, endTime: null, arrivalDate: null },
      },
    ])

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe(
      "Flight with SA Airways FA212 — Lanseria INT Airport to Cape Town INT Airport in Economy",
    )
  })

  it("renders a round-trip route arrow as prose, since Helvetica has no glyph for it", () => {
    const [line] = buildQuoteItineraryLines([
      { ...sameDayFlight, serviceData: { ...sameDayFlight.serviceData, route: "Johannesburg ↔ Cape Town" } },
    ])

    expect(line.text).toContain("Johannesburg to Cape Town")
    expect(line.text).not.toContain("↔")
  })
})

describe("buildQuoteItineraryLines — flight cap bullet", () => {
  it("attaches the cap bullet under the first flight block only", () => {
    const lines = buildQuoteItineraryLines(
      [flightBlock, trainBlock, { ...flightBlock, displayOrder: 3 }],
      "Flights are capped at R2 000pp — incl. baggage & fees",
    )
    const flightLines = lines.filter((line) => line.text.startsWith("Flight"))
    const capBullet = { kind: "item", text: "Flights are capped at R2 000pp — incl. baggage & fees" }
    expect(flightLines[0].bullets).toContainEqual(capBullet)
    expect(flightLines[1].bullets).not.toContainEqual(capBullet)
  })

  it("adds no bullet when the cap is null", () => {
    const lines = buildQuoteItineraryLines([flightBlock], null)
    expect(lines[0].bullets).toEqual([])
  })
})

describe("deriveFlightCapPerPerson", () => {
  function flightLine(unitPrice: number, passengerKind: "adult" | "child" = "adult"): QuoteLineItem {
    return {
      description: "Flight",
      qty: 1,
      unitPrice,
      total: unitPrice,
      pricingSnapshot: {
        source: "pricing_engine",
        pricingMode: "manual",
        packageId: "pkg-1",
        packageName: "Test",
        legId: "leg-1",
        legLabel: null,
        supplierId: "supplier-1",
        supplierName: "SA Airways",
        supplierKind: "airline",
        routeId: null,
        routeName: null,
        suiteTypeId: null,
        suiteTypeName: null,
        rateCardId: null,
        travelDate: "2026-07-17",
        passengerKind,
        baseUnitPrice: unitPrice,
        markupPct: 0,
        singleSupplementPct: null,
        serviceType: null,
        unit: null,
      },
    }
  }

  it("returns the highest adult flight fare across multiple flight lines", () => {
    expect(deriveFlightCapPerPerson([flightLine(2000), flightLine(5000)])).toBe(5000)
  })

  it("ignores non-adult flight lines and non-flight lines", () => {
    const hotelLine: QuoteLineItem = { description: "Hotel", qty: 1, unitPrice: 9000, total: 9000 }
    expect(deriveFlightCapPerPerson([flightLine(2000, "child"), hotelLine])).toBeNull()
  })

  it("returns null when no flight has been priced yet", () => {
    expect(deriveFlightCapPerPerson([flightLine(0)])).toBeNull()
    expect(deriveFlightCapPerPerson([])).toBeNull()
  })
})

describe("formatFlightCapLine", () => {
  it("interpolates the formatted amount", () => {
    expect(formatFlightCapLine((n) => `R${n}`, 2000)).toBe("Flights are capped at R2000pp — incl. baggage & fees")
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

  it("keeps a `#` line as a plain exclusion — pooling leaves no room for subheadings", () => {
    const exclusions = collectQuoteExclusions(
      [
        {
          ...trainBlock,
          serviceData: { ...trainBlock.serviceData, exclusions: ["# Onboard", "Gratuities"] },
        },
      ],
      null,
    )
    expect(exclusions).toEqual(["Onboard", "Gratuities"])
  })

  it("omits the standing exclusion when it is empty", () => {
    expect(collectQuoteExclusions([hotelBlock], "")).toEqual([])
  })
})
