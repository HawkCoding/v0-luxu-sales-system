import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { buildQuoteDetailSections, uniqueDetailLines, withoutTrailingColon } from "./quote-details"

const hotel: VoucherServiceBlock = {
  serviceType: "hotel",
  title: "Ivory Manor",
  displayOrder: 1,
  contactDetails: {
    name: "Ivory Manor Boutique Hotel",
    description: "Set in beautiful gardens.\nNine elegant rooms.\n\nAn airport shuttle is available.",
  },
  serviceData: { inclusions: ["24-hour front desk"] },
}

const train: VoucherServiceBlock = {
  serviceType: "train",
  title: "Rovos Rail",
  displayOrder: 2,
  contactDetails: { name: "Rovos Rail" },
  serviceData: {
    route: "Golf Safari",
    inclusions: ["Welcome drink", "# Onboard:", "All meals", "# Off-train:", "Flights"],
  },
}

const transfer: VoucherServiceBlock = {
  serviceType: "transfer",
  title: "Transfer",
  displayOrder: 0,
  contactDetails: { name: "Ulysses Tours & Transfers" },
  serviceData: { pickup: "OR Tambo", dropoff: "Ivory Manor" },
}

describe("buildQuoteDetailSections", () => {
  it("gives a hotel one bullet per paragraph of its description, instead of its facilities", () => {
    const [section] = buildQuoteDetailSections([hotel])

    expect(section.title).toEqual(["Ivory Manor Boutique Hotel"])
    expect(section.bullets.map((bullet) => bullet.text)).toEqual([
      "Set in beautiful gardens.",
      "Nine elegant rooms.",
      "An airport shuttle is available.",
    ])
  })

  it("falls back to a hotel's facilities when it has no description", () => {
    const [section] = buildQuoteDetailSections([{ ...hotel, contactDetails: { name: "Ivory Manor Boutique Hotel" } }])

    expect(section.bullets).toEqual([{ text: "24-hour front desk", level: 1, bold: false }])
  })

  it("heads a train \"<Operator> Inclusions\" — never its route — and nests items under each subheading", () => {
    const [section] = buildQuoteDetailSections([train])

    expect(section.title).toEqual(["Rovos Rail Inclusions"])
    expect(section.bullets).toEqual([
      { text: "Welcome drink", level: 1, bold: false },
      { text: "Onboard", level: 1, bold: true },
      { text: "All meals", level: 2, bold: false },
      { text: "Off-train", level: 1, bold: true },
      { text: "Flights", level: 2, bold: false },
    ])
  })

  it("names every operator's heading the same way", () => {
    const blueTrain: VoucherServiceBlock = {
      ...train,
      title: "The Blue Train",
      contactDetails: { name: "Blue Train" },
    }

    expect(buildQuoteDetailSections([blueTrain])[0].title).toEqual(["Blue Train Inclusions"])
  })

  it("skips a service with nothing to describe and prints a repeated one once", () => {
    const sections = buildQuoteDetailSections([transfer, hotel, train, { ...hotel, displayOrder: 5 }])

    expect(sections.map((section) => section.title[0])).toEqual(["Ivory Manor Boutique Hotel", "Rovos Rail Inclusions"])
  })

  it("prints an outbound and a return train on different routes once when their inclusions match", () => {
    const sections = buildQuoteDetailSections([train, { ...train, displayOrder: 6, serviceData: { ...train.serviceData, route: "Pretoria → Cape Town" } }])

    expect(sections).toHaveLength(1)
    expect(sections[0].title).toEqual(["Rovos Rail Inclusions"])
  })

  it("names the route under the heading only when one operator has two different inclusion lists", () => {
    const longJourney = {
      ...train,
      displayOrder: 6,
      serviceData: { route: "Pretoria → Dar es Salaam", inclusions: ["Guided excursions"] },
    }
    const sections = buildQuoteDetailSections([train, longJourney, hotel])

    expect(sections.map((section) => section.title)).toEqual([
      ["Rovos Rail Inclusions", "Golf Safari"],
      ["Rovos Rail Inclusions", "Pretoria → Dar es Salaam"],
      ["Ivory Manor Boutique Hotel"],
    ])
  })

  describe("colons", () => {
    it("ends no title line or bullet with a colon, whatever the supplier typed", () => {
      const tour: VoucherServiceBlock = {
        serviceType: "tour",
        title: "Kimberley excursion",
        displayOrder: 3,
        contactDetails: { name: "Big Hole Tours:" },
        serviceData: {
          suiteType: "Half-day tour:",
          itineraryDescription: "Your day includes:\nA visit to the Big Hole.",
          inclusions: ["# Long Journeys:", "# Onboard :", "Lunch:"],
        },
      }
      const colonTrain: VoucherServiceBlock = {
        ...train,
        contactDetails: { name: "Rovos Rail:" },
        serviceData: { route: "Golf Safari:", inclusions: ["# Onboard::", "All meals"] },
      }
      const longJourney: VoucherServiceBlock = {
        ...colonTrain,
        displayOrder: 6,
        serviceData: { route: "Pretoria → Dar es Salaam", inclusions: ["Guided excursions"] },
      }
      const sections = buildQuoteDetailSections([hotel, tour, colonTrain, longJourney])

      const lines = sections.flatMap((section) => [...section.title, ...section.bullets.map((bullet) => bullet.text)])
      expect(lines.filter((line) => line.endsWith(":"))).toEqual([])
      expect(sections.map((section) => section.title)).toEqual([
        ["Ivory Manor Boutique Hotel"],
        ["Big Hole Tours", "Half-day tour"],
        ["Rovos Rail Inclusions", "Golf Safari"],
        ["Rovos Rail Inclusions", "Pretoria → Dar es Salaam"],
      ])
      expect(sections[1].bullets).toEqual([
        { text: "Your day includes", level: 1, bold: false },
        { text: "A visit to the Big Hole.", level: 1, bold: false },
        { text: "Long Journeys", level: 0, bold: true },
        { text: "Onboard", level: 1, bold: true },
        { text: "Lunch", level: 2, bold: false },
      ])
      expect(sections[2].bullets[0]).toEqual({ text: "Onboard", level: 1, bold: true })
    })

    it("keeps a colon inside a line — times and run-in labels", () => {
      const [section] = buildQuoteDetailSections([
        {
          ...train,
          serviceData: { inclusions: ["Check-in 14:00 at Capital Park", "Note: smart casual dress at dinner", "Departs 09:30:"] },
        },
      ])

      expect(section.bullets.map((bullet) => bullet.text)).toEqual([
        "Check-in 14:00 at Capital Park",
        "Note: smart casual dress at dinner",
        "Departs 09:30",
      ])
    })

    it("drops a bullet that was nothing but a colon", () => {
      const [section] = buildQuoteDetailSections([{ ...train, serviceData: { inclusions: [":", "All meals"] } }])

      expect(section.bullets).toEqual([{ text: "All meals", level: 1, bold: false }])
    })
  })
})

describe("withoutTrailingColon", () => {
  it("strips only a colon that ends the text", () => {
    expect(withoutTrailingColon("Onboard:")).toBe("Onboard")
    expect(withoutTrailingColon("  Off-train :  ")).toBe("Off-train")
    expect(withoutTrailingColon("Onboard::")).toBe("Onboard")
    expect(withoutTrailingColon("Onboard: :")).toBe("Onboard")
    expect(withoutTrailingColon("Check-in 14:00")).toBe("Check-in 14:00")
    expect(withoutTrailingColon("Note: bring a jacket")).toBe("Note: bring a jacket")
    expect(withoutTrailingColon("Onboard")).toBe("Onboard")
  })
})

describe("uniqueDetailLines", () => {
  it("de-duplicates after the colon is gone, case- and spacing-insensitively, first spelling wins", () => {
    expect(uniqueDetailLines(["Visas", "Visas:", "visas", "Travel  insurance:", "Travel insurance"])).toEqual([
      "Visas",
      "Travel  insurance",
    ])
  })

  it("drops lines left blank and keeps colons inside a line", () => {
    expect(uniqueDetailLines([":", "  ", "Tips: at your discretion"])).toEqual(["Tips: at your discretion"])
  })
})
