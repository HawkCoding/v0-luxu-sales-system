import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { sortItineraryBlocksChronologically } from "@/lib/itinerary/sort-blocks"

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

describe("sortItineraryBlocksChronologically", () => {
  it("sorts by departure date regardless of displayOrder", () => {
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

    const sorted = sortItineraryBlocksChronologically([hotel, flight, transfer])
    expect(sorted.map((b) => b.title)).toEqual(["Flight", "Transfer", "Hotel"])
  })

  it("keeps displayOrder for same-date blocks", () => {
    const pickup = block({
      serviceType: "transfer",
      title: "Airport Pickup",
      displayOrder: 1,
      serviceData: { departureDate: "2026-08-10" },
    })
    const flight = block({
      serviceType: "airline",
      title: "Flight",
      displayOrder: 0,
      serviceData: { departureDate: "2026-08-10" },
    })
    const hotel = block({
      serviceType: "hotel",
      title: "Hotel Check-In",
      displayOrder: 2,
      serviceData: { departureDate: "2026-08-10" },
    })

    const sorted = sortItineraryBlocksChronologically([pickup, hotel, flight])
    expect(sorted.map((b) => b.title)).toEqual([
      "Flight",
      "Airport Pickup",
      "Hotel Check-In",
    ])
  })

  it("places undated blocks after dated ones", () => {
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

    const sorted = sortItineraryBlocksChronologically([extras, train])
    expect(sorted.map((b) => b.title)).toEqual(["Train", "Additional Services"])
  })

  it("sorts all-undated blocks by displayOrder", () => {
    const second = block({ title: "Second", displayOrder: 1 })
    const first = block({ title: "First", displayOrder: 0 })

    const sorted = sortItineraryBlocksChronologically([second, first])
    expect(sorted.map((b) => b.title)).toEqual(["First", "Second"])
  })

  it("handles an empty array", () => {
    expect(sortItineraryBlocksChronologically([])).toEqual([])
  })

  it("does not mutate the input array", () => {
    const a = block({ title: "A", displayOrder: 1, serviceData: { departureDate: "2026-08-20" } })
    const b = block({ title: "B", displayOrder: 0, serviceData: { departureDate: "2026-08-10" } })
    const input = [a, b]

    sortItineraryBlocksChronologically(input)
    expect(input).toEqual([a, b])
  })
})
