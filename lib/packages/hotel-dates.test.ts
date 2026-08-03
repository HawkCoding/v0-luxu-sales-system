import { describe, expect, it } from "vitest"
import type { PackageLeg, SupplierKind } from "@/lib/types"
import {
  addDays,
  findAnchorTrainLeg,
  resolveHotelStayDates,
  trainArrivalDate,
} from "@/lib/packages/hotel-dates"

function leg(id: string, supplierKind: SupplierKind, sortOrder: number): PackageLeg {
  return {
    id,
    packageId: "pkg",
    supplierId: `supplier-${id}`,
    supplierName: id,
    supplierDescription: null,
    supplierKind,
    pricingMode: "rate_card",
    label: null,
    sortOrder,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [],
  }
}

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31")
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01")
  })

  it("returns the input unchanged when it isn't a date", () => {
    expect(addDays("", 1)).toBe("")
  })
})

describe("trainArrivalDate", () => {
  it("counts the departure day itself — a 3-day journey leaving the 10th arrives the 12th", () => {
    expect(trainArrivalDate("2026-06-10", 3)).toBe("2026-06-12")
  })

  it("treats a same-day journey and a missing duration as arriving on the departure day", () => {
    expect(trainArrivalDate("2026-06-10", 1)).toBe("2026-06-10")
    expect(trainArrivalDate("2026-06-10", null)).toBe("2026-06-10")
  })
})

describe("resolveHotelStayDates", () => {
  const train = { departureDate: "2026-06-10", durationDays: 3 }

  it("checks a 1-night pre-stay in the night before departure", () => {
    expect(resolveHotelStayDates("pre", 1, train)).toEqual({
      checkIn: "2026-06-09",
      checkOut: "2026-06-10",
    })
  })

  it("moves a 2-night pre-stay two days earlier, still checking out on departure day", () => {
    expect(resolveHotelStayDates("pre", 2, train)).toEqual({
      checkIn: "2026-06-08",
      checkOut: "2026-06-10",
    })
  })

  it("checks a post-stay in on the train's arrival day", () => {
    expect(resolveHotelStayDates("post", 1, train)).toEqual({
      checkIn: "2026-06-12",
      checkOut: "2026-06-13",
    })
  })

  it("extends a multi-night post-stay past the arrival day", () => {
    expect(resolveHotelStayDates("post", 3, train)).toEqual({
      checkIn: "2026-06-12",
      checkOut: "2026-06-15",
    })
  })

  it("returns null for custom, unset, or undated anchors", () => {
    expect(resolveHotelStayDates("custom", 1, train)).toBeNull()
    expect(resolveHotelStayDates(null, 1, train)).toBeNull()
    expect(resolveHotelStayDates("pre", 1, { departureDate: null, durationDays: 3 })).toBeNull()
    expect(resolveHotelStayDates("pre", 1, null)).toBeNull()
  })

  it("floors fractional nights at one", () => {
    expect(resolveHotelStayDates("pre", 0, train)?.checkIn).toBe("2026-06-09")
  })
})

describe("findAnchorTrainLeg", () => {
  const hotelBefore = leg("hotel-pre", "hotel_property", 0)
  const outbound = leg("train-out", "train_operator", 1)
  const hotelBetween = leg("hotel-mid", "hotel_property", 2)
  const inbound = leg("train-back", "train_operator", 3)
  const legs = [inbound, hotelBetween, outbound, hotelBefore]

  it("anchors a post-stay to the nearest preceding train", () => {
    expect(findAnchorTrainLeg(legs, hotelBetween.id, "post")?.id).toBe("train-out")
  })

  it("anchors a pre-stay to the nearest following train", () => {
    expect(findAnchorTrainLeg(legs, hotelBetween.id, "pre")?.id).toBe("train-back")
  })

  it("falls back across the hotel when there's no train on the preferred side", () => {
    expect(findAnchorTrainLeg(legs, hotelBefore.id, "post")?.id).toBe("train-out")
  })

  it("returns null when the package has no train leg", () => {
    expect(findAnchorTrainLeg([hotelBefore], hotelBefore.id, "pre")).toBeNull()
  })
})
