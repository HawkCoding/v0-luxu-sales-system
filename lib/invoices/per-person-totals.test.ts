import { describe, expect, it } from "vitest"
import { derivePerPersonTotals, type PerPersonLine, type PerPersonTotals } from "@/lib/invoices/per-person-totals"
import { projectPassengerTotals } from "@/lib/packages/passenger-totals"
import type { PricingSnapshot } from "@/lib/types"

function line(total: number, partial: Partial<PricingSnapshot> = {}): PerPersonLine {
  return {
    total,
    pricing_snapshot: {
      source: "pricing_engine",
      pricingMode: "rate_card",
      legId: "leg-train",
      passengerKind: "adult",
      unit: "per person sharing",
      commission: null,
      ...partial,
    },
  }
}

const adultFare = (total: number) => line(total)
const childFare = (total: number) => line(total, { passengerKind: "child" })
// Shared costs: tagged "adult" by the pricing engine's default, but priced per vehicle / per room.
const shuttle = (total: number) =>
  line(total, { legId: "leg-transfer", serviceType: "transfer", unit: "per vehicle" })
const hotelRoom = (total: number) => line(total, { legId: "leg-hotel", unit: "per room per night" })

/** perAdult × adults + perChild × children, in cents, so the invariant is checked exactly. */
function reconstructedCents({ perAdult, perChild }: PerPersonTotals, adults: number, children: number): number {
  return Math.round((perAdult ?? 0) * 100) * adults + Math.round((perChild ?? 0) * 100) * children
}

describe("derivePerPersonTotals", () => {
  it("divides the total by the adults on an adults-only booking (the client's 4 x R31 970 example)", () => {
    expect(
      derivePerPersonTotals({ lines: [adultFare(120_000), shuttle(7_880)], adults: 4, children: 0, total: 127_880 }),
    ).toEqual({ perAdult: 31_970, perChild: null })
  })

  it("splits 4 adults + 1 child with a shared shuttle pro rata to their fares", () => {
    // Fares R30 000 per adult and R15 000 for the child; the R2 700 shuttle is 2% of the R135 000 of
    // fares, so each person carries 2% more than their own fare.
    const result = derivePerPersonTotals({
      lines: [adultFare(120_000), childFare(15_000), shuttle(2_700)],
      adults: 4,
      children: 1,
      total: 137_700,
    })
    expect(result).toEqual({ perAdult: 30_600, perChild: 15_300 })
    expect(reconstructedCents(result, 4, 1)).toBe(13_770_000)
  })

  it("shares a per-room hotel across a family by fare weight, rounding so the rows still add up", () => {
    const result = derivePerPersonTotals({
      lines: [adultFare(80_000), childFare(40_000), hotelRoom(10_000)],
      adults: 2,
      children: 2,
      total: 130_000,
    })
    expect(result).toEqual({ perAdult: 43_333.33, perChild: 21_666.67 })
    expect(reconstructedCents(result, 2, 2)).toBe(13_000_000)
  })

  it("spreads commission, Agent Commission and Discount the same way", () => {
    const commission = line(9_000, {
      legId: null,
      passengerKind: "service",
      unit: "per person",
      commission: { type: "per_person", value: 2_250, amount: 9_000, source: "line" } as PricingSnapshot["commission"],
    })
    // R90 000 of fares + R9 000 commission − R13 500 discount = R85 500, i.e. 95% of the fares.
    expect(
      derivePerPersonTotals({
        lines: [adultFare(60_000), childFare(30_000), commission],
        adults: 2,
        children: 2,
        total: 85_500,
      }),
    ).toEqual({ perAdult: 28_500, perChild: 14_250 })
  })

  it("treats a fixed-package total or an overridden tour price as shared", () => {
    expect(
      derivePerPersonTotals({
        lines: [
          adultFare(60_000),
          childFare(30_000),
          line(9_000, { legId: null, unit: "per person" }),
          line(9_000, { legId: "leg-tour", unit: "per person", manualTourPrice: 9_000 }),
        ],
        adults: 2,
        children: 2,
        total: 108_000,
      }),
    ).toEqual({ perAdult: 36_000, perChild: 18_000 })
  })

  it("splits equally per paying guest when everything is shared", () => {
    const result = derivePerPersonTotals({
      lines: [hotelRoom(70_000), shuttle(30_000)],
      adults: 2,
      children: 1,
      total: 100_000,
    })
    // R33 333.33 per adult; the child takes the remaining cent.
    expect(result).toEqual({ perAdult: 33_333.33, perChild: 33_333.34 })
    expect(reconstructedCents(result, 2, 1)).toBe(10_000_000)
  })

  it("gives children who travel free on every fare R0 and the adults the whole total", () => {
    expect(
      derivePerPersonTotals({
        lines: [adultFare(80_000), childFare(0), shuttle(10_000)],
        adults: 2,
        children: 1,
        total: 90_000,
      }),
    ).toEqual({ perAdult: 45_000, perChild: 0 })
  })

  it("gives children with no fare line of their own an equal share of the shared costs", () => {
    // Adults pay a per-person fare; the children have no child line at all (per-suite pricing), so
    // the R9 000 room is shared equally by all three paying guests.
    const result = derivePerPersonTotals({
      lines: [adultFare(60_000), hotelRoom(9_000)],
      adults: 2,
      children: 1,
      total: 69_000,
    })
    expect(result).toEqual({ perAdult: 33_000, perChild: 3_000 })
    expect(reconstructedCents(result, 2, 1)).toBe(6_900_000)
  })

  it("takes a deduction larger than the shared costs off the fares pro rata, never below R0", () => {
    expect(
      derivePerPersonTotals({ lines: [adultFare(60_000)], adults: 2, children: 1, total: 54_000 }),
    ).toEqual({ perAdult: 27_000, perChild: 0 })
  })

  it("divides by the projected paying pax: an infant drops out, an over-age child pays as an adult", () => {
    // The enquiry says 2 adults + 3 children aged 1, 8 and 15. With infants up to 2 and children up
    // to 12, that prices as 3 adults (the 15-year-old), 1 child and 1 free infant.
    const pax = projectPassengerTotals({ noOfAdults: 2, noOfChildren: 3, childAges: [1, 8, 15] }, { infantMax: 2, childMax: 12 })
    expect(pax).toEqual({ adultCount: 3, childCount: 1, infantCount: 1 })

    const result = derivePerPersonTotals({
      lines: [adultFare(90_000), childFare(15_000), line(0, { passengerKind: "infant" }), shuttle(2_100)],
      adults: pax.adultCount,
      children: pax.childCount,
      total: 107_100,
    })
    // R105 000 of fares scaled by 1.02 for the shuttle: R30 600 per adult, R15 300 for the one child.
    expect(result).toEqual({ perAdult: 30_600, perChild: 15_300 })
    expect(reconstructedCents(result, 3, 1)).toBe(10_710_000)
  })

  it("carries a charged infant line as a shared cost, never as a divisor", () => {
    expect(
      derivePerPersonTotals({
        lines: [adultFare(60_000), childFare(30_000), line(9_000, { passengerKind: "infant" })],
        adults: 2,
        children: 2,
        total: 99_000,
      }),
    ).toEqual({ perAdult: 33_000, perChild: 16_500 })
  })

  it("keeps the adults-only residual under half a cent per adult", () => {
    const result = derivePerPersonTotals({ lines: [], adults: 3, children: 0, total: 100_000 })
    expect(result).toEqual({ perAdult: 33_333.33, perChild: null })
    expect(Math.abs(reconstructedCents(result, 3, 0) - 10_000_000)).toBeLessThanOrEqual(1)
  })

  it("prints nothing without adults or a total", () => {
    expect(derivePerPersonTotals({ lines: [], adults: 0, children: 2, total: 100 })).toEqual({
      perAdult: null,
      perChild: null,
    })
    expect(derivePerPersonTotals({ lines: [], adults: 2, children: 0, total: 0 })).toEqual({
      perAdult: null,
      perChild: null,
    })
  })
})
