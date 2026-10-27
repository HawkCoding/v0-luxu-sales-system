import { describe, expect, it } from "vitest"
import type { PricingSnapshot, QuoteLineItem } from "@/lib/types"
import { describeLineDate, lineDateRange } from "./line-item-date"

function line(snapshot: Partial<PricingSnapshot> | null, overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    description: "Service",
    supplierDescription: null,
    qty: 1,
    unitPrice: 100,
    total: 100,
    pricingSnapshot: snapshot
      ? ({ source: "pricing_engine", travelDate: "2027-07-09", supplierKind: null, ...snapshot } as PricingSnapshot)
      : null,
    ...overrides,
  }
}

describe("lineDateRange", () => {
  it("spans a train from departure to its stamped arrival", () => {
    expect(lineDateRange(line({ supplierKind: "train_operator", serviceEndDate: "2027-07-12" }))).toEqual({
      start: "2027-07-09",
      end: "2027-07-12",
    })
  })

  it("reads qty as nights on a legacy per-room hotel line", () => {
    const hotel = line({ supplierKind: "hotel_property", accommodationPricingBasis: "per_room" }, { qty: 3 })
    expect(lineDateRange(hotel)).toEqual({ start: "2027-07-09", end: "2027-07-12" })
  })

  it("reads qty as nights on a legacy hotel line with a typed room price", () => {
    const hotel = line({ supplierKind: "hotel_property", manualRoomPrice: 2000 }, { qty: 2 })
    expect(lineDateRange(hotel)?.end).toBe("2027-07-11")
  })

  it("uses chargedNights on a legacy per-person hotel, never the person-night qty", () => {
    const hotel = line(
      { supplierKind: "hotel_property", accommodationPricingBasis: "per_person", occupantCount: 2, chargedNights: 2 },
      { qty: 4 },
    )
    expect(lineDateRange(hotel)).toEqual({ start: "2027-07-09", end: "2027-07-11" })
  })

  it("prefers stayNights over the charged qty when a night was complimentary", () => {
    const hotel = line(
      { supplierKind: "hotel_property", accommodationPricingBasis: "per_room", stayNights: 3, complimentaryNights: 1 },
      { qty: 2 },
    )
    expect(lineDateRange(hotel)?.end).toBe("2027-07-12")
  })

  it("shows only the check-in on a legacy per-person hotel with no night count", () => {
    const hotel = line({ supplierKind: "hotel_property", accommodationPricingBasis: "per_person" }, { qty: 4 })
    expect(lineDateRange(hotel)).toEqual({ start: "2027-07-09", end: "2027-07-09" })
  })

  it("spans a rental to its stamped return date", () => {
    const rental = line({ supplierKind: "vehicle_rental", serviceType: "rental", serviceEndDate: "2027-07-14" })
    expect(lineDateRange(rental)).toEqual({ start: "2027-07-09", end: "2027-07-14" })
  })

  it("keeps a transfer to its single day", () => {
    expect(lineDateRange(line({ supplierKind: "transfers", serviceType: "transfer" }))).toEqual({
      start: "2027-07-09",
      end: "2027-07-09",
    })
  })

  it("never lets a stamped end land before the start", () => {
    expect(lineDateRange(line({ serviceEndDate: "2027-07-01" }))?.end).toBe("2027-07-09")
  })

  it("returns null for the commission line", () => {
    const commission = line(
      { commission: { type: "percent", value: 10, amount: 500, source: "line" } },
      { description: "Commission" },
    )
    expect(lineDateRange(commission)).toBeNull()
  })

  it("returns null for rounding and adjustment lines", () => {
    expect(lineDateRange(line({}, { description: "Rounding" }))).toBeNull()
    expect(lineDateRange(line({}, { description: "Adjustment — goodwill" }))).toBeNull()
  })

  it("returns null with no snapshot", () => {
    expect(lineDateRange(line(null))).toBeNull()
  })

  it("returns null when travelDate is empty or invalid", () => {
    expect(lineDateRange(line({ travelDate: "" }))).toBeNull()
    expect(lineDateRange(line({ travelDate: "not-a-date" }))).toBeNull()
  })
})

describe("describeLineDate", () => {
  it("prints a single day", () => {
    expect(describeLineDate(line({}))).toBe("09 Jul 2027")
  })

  it("collapses a same-month range", () => {
    expect(describeLineDate(line({ serviceEndDate: "2027-07-12" }))).toBe("09–12 Jul 2027")
  })

  it("keeps both months across a month boundary", () => {
    expect(describeLineDate(line({ travelDate: "2027-07-28", serviceEndDate: "2027-08-02" }))).toBe(
      "28 Jul – 02 Aug 2027",
    )
  })

  it("keeps both years across a year boundary", () => {
    expect(describeLineDate(line({ travelDate: "2027-12-28", serviceEndDate: "2028-01-02" }))).toBe(
      "28 Dec 2027 – 02 Jan 2028",
    )
  })

  it("returns null for an undated line", () => {
    expect(describeLineDate(line(null))).toBeNull()
  })
})
