import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksByLegOrder } from "@/lib/itinerary/sort-blocks"

function block(
  overrides: Partial<VoucherServiceBlock> & { displayOrder: number },
): VoucherServiceBlock {
  return {
    serviceType: "train",
    title: "Service",
    contactDetails: {},
    serviceData: {},
    ...overrides,
  }
}

describe("sortItineraryBlocksByLegOrder", () => {
  it("follows displayOrder even when the dates run the other way", () => {
    const hotel = block({
      serviceType: "hotel",
      title: "Hotel",
      displayOrder: 0,
      serviceData: { departureDate: "2026-08-12" },
    })
    const flight = block({
      serviceType: "airline",
      title: "Flight",
      displayOrder: 2,
      serviceData: { departureDate: "2026-08-10" },
    })
    const transfer = block({
      serviceType: "transfer",
      title: "Transfer",
      displayOrder: 1,
      serviceData: { departureDate: "2026-08-11" },
    })

    const sorted = sortItineraryBlocksByLegOrder([flight, transfer, hotel])
    expect(sorted.map((b) => b.title)).toEqual(["Hotel", "Transfer", "Flight"])
  })

  it("ignores start times: a later block with an earlier time stays after", () => {
    const flight = block({
      serviceType: "airline",
      title: "Flight",
      displayOrder: 0,
      serviceData: { departureDate: "2026-11-25", startTime: "14:00" },
    })
    const transfer = block({
      serviceType: "transfer",
      title: "Transfer",
      displayOrder: 1,
      serviceData: { departureDate: "2026-11-25", startTime: "09:00" },
    })

    const sorted = sortItineraryBlocksByLegOrder([transfer, flight])
    expect(sorted.map((b) => b.title)).toEqual(["Flight", "Transfer"])
  })

  it("keeps undated blocks where the salesperson put them", () => {
    const extras = block({
      serviceType: "additional_service",
      title: "Additional Services",
      displayOrder: 0,
      serviceData: {},
    })
    const train = block({
      title: "Train",
      displayOrder: 1,
      serviceData: { departureDate: "2026-08-15" },
    })

    const sorted = sortItineraryBlocksByLegOrder([train, extras])
    expect(sorted.map((b) => b.title)).toEqual(["Additional Services", "Train"])
  })

  it("keeps input order for equal displayOrder", () => {
    const a = block({ title: "A", displayOrder: 1 })
    const b = block({ title: "B", displayOrder: 1 })

    expect(sortItineraryBlocksByLegOrder([a, b]).map((x) => x.title)).toEqual(["A", "B"])
  })

  it("handles an empty array", () => {
    expect(sortItineraryBlocksByLegOrder([])).toEqual([])
  })

  it("does not mutate the input array", () => {
    const a = block({ title: "A", displayOrder: 1 })
    const b = block({ title: "B", displayOrder: 0 })
    const input = [a, b]

    sortItineraryBlocksByLegOrder(input)
    expect(input).toEqual([a, b])
  })
})
