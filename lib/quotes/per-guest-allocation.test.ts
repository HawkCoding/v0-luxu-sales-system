import { describe, expect, it } from "vitest"
import type { PricingSnapshot, PricingUnitRef, SupplierKind } from "@/lib/types"
import { allocatePerGuest, type PerGuestLine } from "./per-guest-allocation"

function ref(index: number, adults: number, children = 0, infants = 0): PricingUnitRef {
  return { index, adults, children, infants }
}

function line(total: number, snapshot: Partial<PricingSnapshot> | null): PerGuestLine {
  return {
    total,
    pricing_snapshot: snapshot
      ? {
          source: "pricing_engine",
          pricingMode: "rate_card",
          legId: null,
          supplierKind: null,
          passengerKind: "adult",
          singleSupplementPct: null,
          commission: null,
          unit: null,
          ...snapshot,
        }
      : null,
  }
}

function unitLine(
  total: number,
  supplierKind: SupplierKind,
  legId: string,
  unit: string,
  unitRefs: PricingUnitRef[] | undefined,
  extra: Partial<PricingSnapshot> = {},
): PerGuestLine {
  return line(total, { supplierKind, legId, unit, unitRefs, ...extra })
}

const train = (total: number, refs: PricingUnitRef[], extra: Partial<PricingSnapshot> = {}) =>
  unitLine(total, "train_operator", "leg-train", "per person sharing", refs, extra)
const roomRate = (total: number, refs: PricingUnitRef[]) =>
  unitLine(total, "hotel_property", "leg-hotel", "per room per night", refs)
const transfer = (total: number) =>
  line(total, { supplierKind: "transfers", legId: "leg-transfer", serviceType: "transfer", unit: "per vehicle" })

function amounts(rows: ReturnType<typeof allocatePerGuest>) {
  return rows?.map((row) => [row.label, row.amount])
}

describe("allocatePerGuest", () => {
  it("prices Carmen's 2 sharing + 1 single on a train with a per-room hotel", () => {
    const lines = [
      train(40_000, [ref(0, 2)]),
      train(27_000, [ref(1, 1)], { singleSupplementPct: 35 }),
      roomRate(9_456, [ref(0, 2)]),
      roomRate(8_349, [ref(1, 1)]),
    ]
    expect(amounts(allocatePerGuest({ lines, adults: 3, children: 0, target: 84_805 }))).toEqual([
      ["Adult 1 (sharing)", 24_728],
      ["Adult 2 (sharing)", 24_728],
      ["Adult 3 (single, supplement incl.)", 35_349],
    ])
  })

  it("seats the lone traveller last on every leg, whatever order the rooms were entered in", () => {
    const lines = [
      train(27_000, [ref(0, 1)], { singleSupplementPct: 35 }),
      train(40_000, [ref(1, 2)]),
      roomRate(8_349, [ref(0, 1)]),
      roomRate(9_456, [ref(1, 2)]),
    ]
    const rows = allocatePerGuest({ lines, adults: 3, children: 0, target: 84_805 })
    expect(rows?.map((row) => row.amount)).toEqual([24_728, 24_728, 35_349])
    expect(rows?.[2]).toMatchObject({ single: true, supplement: true })
  })

  it("splits a per-room suite evenly between 2 adults and 2 children", () => {
    const rows = allocatePerGuest({
      lines: [roomRate(78_750, [ref(0, 2, 2)])],
      adults: 2,
      children: 2,
      childAges: [6, 9],
      target: 78_750,
    })
    expect(amounts(rows)).toEqual([
      ["Adult 1 (sharing)", 19_687.5],
      ["Adult 2 (sharing)", 19_687.5],
      ["Child 1 (age 6)", 19_687.5],
      ["Child 2 (age 9)", 19_687.5],
    ])
  })

  it("gives a child their own lower fare and splits a transfer evenly", () => {
    const lines = [
      train(60_000, [ref(0, 2, 1)]),
      train(15_000, [ref(0, 2, 1)], { passengerKind: "child" }),
      transfer(3_000),
    ]
    expect(amounts(allocatePerGuest({ lines, adults: 2, children: 1, childAges: [8], target: 78_000 }))).toEqual([
      ["Adult 1 (sharing)", 31_000],
      ["Adult 2 (sharing)", 31_000],
      ["Child 1 (age 8)", 16_000],
    ])
  })

  it("spreads commission over the guests pro rata", () => {
    const lines = [
      train(20_000, [ref(0, 2, 1)]),
      train(5_000, [ref(0, 2, 1)], { passengerKind: "child" }),
      line(2_500, { passengerKind: "service", commission: { type: "percent" } as PricingSnapshot["commission"] }),
    ]
    expect(allocatePerGuest({ lines, adults: 2, children: 1, target: 27_500 })?.map((row) => row.amount)).toEqual([
      11_000, 11_000, 5_500,
    ])
  })

  it("scales to a net target, so a discount comes off every guest pro rata", () => {
    const lines = [train(40_000, [ref(0, 2)]), train(27_000, [ref(1, 1)], { singleSupplementPct: 35 })]
    const rows = allocatePerGuest({ lines, adults: 3, children: 0, target: 67_000 - 6_700 })
    expect(rows?.map((row) => row.amount)).toEqual([18_000, 18_000, 24_300])
  })

  it("rounds each row to cents and lets the last guest take the remainder", () => {
    const rows = allocatePerGuest({ lines: [transfer(100)], adults: 3, children: 0, target: 100 })
    expect(rows?.map((row) => row.amount)).toEqual([33.33, 33.33, 33.34])
    expect(rows?.map((row) => row.label)).toEqual(["Adult 1", "Adult 2", "Adult 3"])
  })

  it("never hands the rounding cent to a child sharing free", () => {
    const lines = [unitLine(200, "hotel_property", "leg-hotel", "per person per night", [ref(0, 3, 1)])]
    expect(allocatePerGuest({ lines, adults: 3, children: 1, target: 200 })?.map((row) => row.amount)).toEqual([
      66.67, 66.67, 66.66, 0,
    ])
  })

  it("does not call an adult alone with an infant a single", () => {
    const rows = allocatePerGuest({ lines: [roomRate(4_000, [ref(0, 1, 0, 1)])], adults: 1, children: 0, target: 4_000 })
    expect(rows?.[0].label).toBe("Adult 1 (sharing)")
  })

  it("seats an adults-only room before a parent and child of the same size on every leg", () => {
    const lines = [
      train(40_000, [ref(0, 2)]),
      train(20_000, [ref(1, 1, 1)]),
      train(10_000, [ref(1, 1, 1)], { passengerKind: "child" }),
      roomRate(6_000, [ref(0, 1, 1)]),
      roomRate(8_000, [ref(1, 2)]),
    ]
    const rows = allocatePerGuest({ lines, adults: 3, children: 1, target: 84_000 })
    expect(rows?.map((row) => row.amount)).toEqual([24_000, 24_000, 23_000, 13_000])
  })

  it("gives an infant's fare to the paying occupants of the infant's room", () => {
    const lines = [
      train(20_000, [ref(0, 2, 0, 1)]),
      train(1_000, [ref(0, 2, 0, 1)], { passengerKind: "infant" }),
      train(10_000, [ref(1, 1)]),
    ]
    expect(allocatePerGuest({ lines, adults: 3, children: 0, target: 31_000 })?.map((row) => row.amount)).toEqual([
      10_500, 10_500, 10_000,
    ])
  })

  it("does not call a lone tour party or flight booking a single", () => {
    const lines = [
      unitLine(5_000, "tour_operator", "leg-tour", "per person", [ref(0, 1)]),
      unitLine(5_000, "tour_operator", "leg-tour", "per person", [ref(1, 1)]),
    ]
    expect(allocatePerGuest({ lines, adults: 2, children: 0, target: 10_000 })?.map((row) => row.label)).toEqual([
      "Adult 1",
      "Adult 2",
    ])
  })

  it("labels a child with no recorded age without one", () => {
    const rows = allocatePerGuest({ lines: [roomRate(4_000, [ref(0, 1, 1)])], adults: 1, children: 1, target: 4_000 })
    expect(rows?.map((row) => row.label)).toEqual(["Adult 1 (sharing)", "Child 1"])
  })

  it("returns null for a quote whose unit lines predate unitRefs", () => {
    expect(
      allocatePerGuest({ lines: [train(40_000, undefined as unknown as PricingUnitRef[])], adults: 2, children: 0, target: 40_000 }),
    ).toBeNull()
  })

  it("returns null when a leg seats more guests than the booking pays for", () => {
    expect(allocatePerGuest({ lines: [roomRate(9_000, [ref(0, 3)])], adults: 2, children: 0, target: 9_000 })).toBeNull()
    expect(allocatePerGuest({ lines: [roomRate(9_000, [ref(0, 2, 1)])], adults: 2, children: 0, target: 9_000 })).toBeNull()
  })

  it("returns null with no guests or no target", () => {
    expect(allocatePerGuest({ lines: [transfer(100)], adults: 0, children: 0, target: 100 })).toBeNull()
    expect(allocatePerGuest({ lines: [transfer(100)], adults: 2, children: 0, target: 0 })).toBeNull()
  })

  it("shares lines without a pricing snapshot and fixed-package legs across everyone", () => {
    const lines = [
      line(600, null),
      line(300, { supplierKind: "train_operator", legId: "leg-train", pricingMode: "fixed_package", unit: null }),
    ]
    expect(allocatePerGuest({ lines, adults: 2, children: 1, target: 900 })?.map((row) => row.amount)).toEqual([
      300, 300, 300,
    ])
  })
})
