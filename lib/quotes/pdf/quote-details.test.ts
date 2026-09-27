import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { buildQuoteDetailSections } from "./quote-details"

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

  it("heads a train with its route and nests items under each subheading", () => {
    const [section] = buildQuoteDetailSections([train])

    expect(section.title).toEqual(["Rovos Rail", "Golf Safari"])
    expect(section.bullets).toEqual([
      { text: "Welcome drink", level: 1, bold: false },
      { text: "Onboard:", level: 1, bold: true },
      { text: "All meals", level: 2, bold: false },
      { text: "Off-train:", level: 1, bold: true },
      { text: "Flights", level: 2, bold: false },
    ])
  })

  it("skips a service with nothing to describe and prints a repeated one once", () => {
    const sections = buildQuoteDetailSections([transfer, hotel, train, { ...hotel, displayOrder: 5 }])

    expect(sections.map((section) => section.title[0])).toEqual(["Ivory Manor Boutique Hotel", "Rovos Rail"])
  })
})
