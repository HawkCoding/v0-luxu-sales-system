import { describe, expect, it } from "vitest"
import { formatMoney } from "@/lib/money"
import type { PaxGroupMeta, PricingSnapshot, PricingUnitRef, SupplierKind } from "@/lib/types"
import {
  allocatePaxGroups,
  formatPaxGroupLine,
  formatPaxGroupLineForPrint,
  formatPaxGroupPartLines,
  formatPaxGroupParts,
  paxGroupNoun,
  paxGroupScopeTag,
  readPaxGroups,
  type PaxGroupPriceLine,
  type PaxGroupPricing,
  type PaxGroupPricingLine,
} from "./pax-group-pricing"

/** Intl groups with a non-breaking space; collapse it so assertions stay readable. */
const money = (n: number) => formatMoney(n).replace(/[  ]/g, " ")

function groups(count: number, prefix = "Twin Deluxe Suite"): PaxGroupMeta[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `g${index + 1}`,
    position: index + 1,
    label: `${prefix} ${index + 1}`,
  }))
}

interface RefInput {
  index: number
  unitId?: string
  adults?: number
  children?: number
  infants?: number
  groups?: string[]
  rate?: string | null
}

function ref({ index, unitId, adults = 0, children = 0, infants = 0, groups: ids, rate }: RefInput): PricingUnitRef {
  return {
    index,
    ...(unitId ? { unitId } : {}),
    adults,
    children,
    infants,
    ...(ids ? { paxGroupIds: ids } : {}),
    ...(rate !== undefined ? { rateTypeId: rate } : {}),
  }
}

function line(total: number | null, snapshot: Partial<PricingSnapshot> | null): PaxGroupPricingLine {
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
): PaxGroupPricingLine {
  return line(total, { supplierKind, legId, unit, unitRefs, ...extra })
}

/** A primary-leg train fare line: carries the booking's groups. */
function trainFare(
  total: number,
  paxGroups: PaxGroupMeta[],
  refs: PricingUnitRef[],
  extra: Partial<PricingSnapshot> = {},
): PaxGroupPricingLine {
  return unitLine(total, "train_operator", "leg-train", "per person sharing", refs, { paxGroups, ...extra })
}

const hotelRoom = (total: number, refs: PricingUnitRef[], extra: Partial<PricingSnapshot> = {}) =>
  unitLine(total, "hotel_property", "leg-hotel", "per room per night", refs, extra)

const transfer = (total: number, paxGroupIds?: string[], transportRequestId = "tr-1") =>
  line(total, {
    supplierKind: "transfers",
    legId: "leg-transfer",
    serviceType: "transfer",
    unit: "per vehicle",
    passengerKind: "service",
    transportRequestId,
    ...(paxGroupIds ? { paxGroupIds } : {}),
  })

const commission = (total: number) =>
  line(total, { passengerKind: "service", commission: { type: "percent" } as PricingSnapshot["commission"] })

function cents(value: number): number {
  return Math.round(value * 100)
}

function expectAddsUp(result: PaxGroupPricing | null, target: number): void {
  expect(result).not.toBeNull()
  if (!result) return
  for (const groupLine of result.lines) {
    const fromParts = groupLine.parts.reduce((sum, part) => sum + part.count * cents(part.perPerson), 0)
    expect(cents(groupLine.subtotal)).toBe(fromParts)
  }
  expect(result.lines.reduce((sum, groupLine) => sum + cents(groupLine.subtotal), 0)).toBe(cents(target))
  expect(cents(result.total)).toBe(cents(target))
}

function sentences(result: PaxGroupPricing | null): string[] | undefined {
  return result?.lines.map((groupLine) => formatPaxGroupLine(groupLine, money))
}

const RATE_LABELS = new Map<string, string | null>([
  ["rate-sa", "SA"],
  ["rate-tw", "TW"],
  ["rate-blank", "   "],
  ["rate-null", null],
])

/**
 * Carmen's South Africa package: six suites on the train (SA and TW rates, two suites holding one
 * guest on each rate, two children-only suites), suites 2+3 and 4+5 each sharing one hotel apartment,
 * suites 1 and 6 each in a classic room, a minibus shared by everyone, and our commission on top.
 */
function carmenFixture(): { lines: PaxGroupPricingLine[]; target: number } {
  const meta = [...groups(5), { id: "g6", position: 6, label: "Double Deluxe Suite 6" }]
  const train = (total: number, refs: PricingUnitRef[], extra: Partial<PricingSnapshot>) =>
    trainFare(total, meta, refs, extra)
  const lines = [
    // Twin Deluxe, SA adults: suite 1's pair plus the SA guest of suites 2 and 4.
    train(
      80_192,
      [
        ref({ index: 0, unitId: "u1", adults: 2, groups: ["g1"], rate: "rate-sa" }),
        ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"], rate: "rate-sa" }),
        ref({ index: 3, unitId: "u4", adults: 1, groups: ["g4"], rate: "rate-sa" }),
      ],
      { rateTypeId: "rate-sa" },
    ),
    // Twin Deluxe, TW adults: the other guest of suites 2 and 4.
    train(
      50_272,
      [
        ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"], rate: "rate-tw" }),
        ref({ index: 3, unitId: "u4", adults: 1, groups: ["g4"], rate: "rate-tw" }),
      ],
      { rateTypeId: "rate-tw" },
    ),
    train(30_112, [ref({ index: 2, unitId: "u3", children: 2, groups: ["g3"], rate: "rate-tw" })], {
      rateTypeId: "rate-tw",
      passengerKind: "child",
    }),
    train(24_928, [ref({ index: 4, unitId: "u5", children: 2, groups: ["g5"], rate: "rate-sa" })], {
      rateTypeId: "rate-sa",
      passengerKind: "child",
    }),
    train(40_096, [ref({ index: 5, unitId: "u6", adults: 2, groups: ["g6"], rate: "rate-sa" })], {
      rateTypeId: "rate-sa",
      suiteTypeName: "Double Deluxe Suite",
    }),
    hotelRoom(4_800, [ref({ index: 0, unitId: "h1", adults: 2, groups: ["g1"] })]),
    hotelRoom(10_752, [ref({ index: 1, unitId: "h2", adults: 2, children: 2, groups: ["g2", "g3"] })]),
    hotelRoom(10_752, [ref({ index: 2, unitId: "h3", adults: 2, children: 2, groups: ["g4", "g5"] })]),
    hotelRoom(4_800, [ref({ index: 3, unitId: "h4", adults: 2, groups: ["g6"] })]),
    transfer(4_800),
    commission(10_896),
  ]
  return { lines, target: 272_400 }
}

describe("allocatePaxGroups", () => {
  it("prices Carmen's six suites in her wording, adding up to the total", () => {
    const { lines, target } = carmenFixture()
    const result = allocatePaxGroups({ lines, target, rateLabels: RATE_LABELS })
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R23 800,00 per person (SA)",
      "Twin Deluxe Suite 2 - 1 Adult x R24 100,00 (SA) & 1 Adult x R29 400,00 (TW)",
      "Twin Deluxe Suite 3 - 2 Children x R18 900,00 per child (TW)",
      "Twin Deluxe Suite 4 - 1 Adult x R24 100,00 (SA) & 1 Adult x R29 400,00 (TW)",
      "Twin Deluxe Suite 5 - 2 Children x R16 200,00 per child (SA)",
      "Double Deluxe Suite 6 - 2 Adults x R23 800,00 per person (SA)",
    ])
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([
      47_600, 53_500, 37_800, 53_500, 32_400, 47_600,
    ])
    expect(result).toMatchObject({ adults: 8, children: 4, total: 272_400 })
    expect(result?.lines.map((groupLine) => [groupLine.groupId, groupLine.position, groupLine.adults, groupLine.children])).toEqual([
      ["g1", 1, 2, 0],
      ["g2", 2, 2, 0],
      ["g3", 3, 0, 2],
      ["g4", 4, 2, 0],
      ["g5", 5, 0, 2],
      ["g6", 6, 2, 0],
    ])
    expectAddsUp(result, target)
  })

  it("carries the rate type and its label on every part", () => {
    const { lines, target } = carmenFixture()
    const suite2 = allocatePaxGroups({ lines, target, rateLabels: RATE_LABELS })?.lines[1]
    expect(suite2?.parts).toEqual([
      { kind: "adult", count: 1, perPerson: 24_100, rateTypeId: "rate-sa", rateLabel: "SA", supplement: false },
      { kind: "adult", count: 1, perPerson: 29_400, rateTypeId: "rate-tw", rateLabel: "TW", supplement: false },
    ])
  })

  it("prints no rate tag without rate labels", () => {
    const { lines, target } = carmenFixture()
    expect(sentences(allocatePaxGroups({ lines, target }))?.[1]).toBe(
      "Twin Deluxe Suite 2 - 1 Adult x R24 100,00 & 1 Adult x R29 400,00",
    )
  })

  it("splits a hotel apartment for two suites per person across both", () => {
    const meta = groups(3)
    const suite2 = ref({ index: 1, adults: 1, children: 2, groups: ["g2"] })
    const lines = [
      trainFare(30_000, meta, [
        ref({ index: 0, adults: 1, groups: ["g1"] }),
        suite2,
        ref({ index: 2, adults: 1, groups: ["g3"] }),
      ]),
      trainFare(10_000, meta, [suite2], { passengerKind: "child" }),
      // One apartment for suites 2 (1 adult + 2 children) and 3 (1 adult): R8 000 over 4 people.
      hotelRoom(8_000, [ref({ index: 0, adults: 2, children: 2, groups: ["g2", "g3"] })]),
    ]
    const result = allocatePaxGroups({ lines, target: 48_000 })
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([10_000, 26_000, 12_000])
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 1 Adult x R10 000,00",
      "Twin Deluxe Suite 2 - 1 Adult x R12 000,00 & 2 Children x R7 000,00 per child",
      "Twin Deluxe Suite 3 - 1 Adult x R12 000,00",
    ])
    expectAddsUp(result, 48_000)
  })

  it("splits a transfer with pax groups only across those groups' paying guests", () => {
    const meta = groups(3)
    const lines = [
      trainFare(30_000, meta, [
        ref({ index: 0, adults: 2, groups: ["g1"] }),
        ref({ index: 1, adults: 1, groups: ["g2"] }),
        ref({ index: 2, adults: 2, groups: ["g3"] }),
      ]),
      trainFare(0, meta, [ref({ index: 1, adults: 1, infants: 1, groups: ["g2"] })], { passengerKind: "infant" }),
      transfer(1_500, ["g2", "g3"]),
    ]
    const result = allocatePaxGroups({ lines, target: 31_500 })
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([12_000, 6_500, 13_000])
    expectAddsUp(result, 31_500)
  })

  it("splits an unassigned transfer and a line with no snapshot across everyone", () => {
    const meta = groups(2)
    const lines = [
      trainFare(40_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"] }), ref({ index: 1, adults: 2, groups: ["g2"] })]),
      transfer(2_000),
      transfer(1_000, []),
      line(400, null),
    ]
    const result = allocatePaxGroups({ lines, target: 43_400 })
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([21_700, 21_700])
  })

  it("treats a transfer naming only unknown groups as shared by everyone", () => {
    const meta = groups(2)
    const lines = [
      trainFare(20_000, meta, [ref({ index: 0, adults: 1, groups: ["g1"] }), ref({ index: 1, adults: 1, groups: ["g2"] })]),
      transfer(1_000, ["gone"]),
    ]
    expect(allocatePaxGroups({ lines, target: 21_000 })?.lines.map((groupLine) => groupLine.subtotal)).toEqual([
      10_500, 10_500,
    ])
  })

  it("skips commission lines and spreads them by scaling to the target", () => {
    const meta = groups(2)
    const lines = [
      trainFare(30_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"] }), ref({ index: 1, adults: 1, groups: ["g2"] })]),
      commission(3_000),
    ]
    const result = allocatePaxGroups({ lines, target: 33_000 })
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R11 000,00 per person",
      "Twin Deluxe Suite 2 - 1 Adult x R11 000,00",
    ])
  })

  it("gives an infant's fare to the adults of the infant's suite", () => {
    const meta = groups(2)
    const lines = [
      trainFare(40_000, meta, [ref({ index: 0, adults: 2, infants: 1, groups: ["g1"] }), ref({ index: 1, adults: 2, groups: ["g2"] })]),
      trainFare(1_000, meta, [ref({ index: 0, adults: 2, infants: 1, groups: ["g1"] })], { passengerKind: "infant" }),
    ]
    const result = allocatePaxGroups({ lines, target: 41_000 })
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([21_000, 20_000])
    // Infants are never persons.
    expect(result).toMatchObject({ adults: 4, children: 0 })
  })

  it("lands an infant's fare on the suite's adults when its rate slice holds none", () => {
    const meta = groups(2)
    const lines = [
      // Suite 1: both adults moved to TW; the base (SA) slice keeps only the infant.
      trainFare(20_000, meta, [ref({ index: 0, unitId: "u1", adults: 2, groups: ["g1"], rate: "rate-tw" })], {
        rateTypeId: "rate-tw",
      }),
      trainFare(600, meta, [ref({ index: 0, unitId: "u1", infants: 1, groups: ["g1"], rate: "rate-sa" })], {
        rateTypeId: "rate-sa",
        passengerKind: "infant",
      }),
      trainFare(16_000, meta, [ref({ index: 1, unitId: "u2", adults: 2, groups: ["g2"], rate: "rate-sa" })], {
        rateTypeId: "rate-sa",
      }),
    ]
    const result = allocatePaxGroups({ lines, target: 36_600, rateLabels: RATE_LABELS })
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R10 300,00 per person (TW)",
      "Twin Deluxe Suite 2 - 2 Adults x R8 000,00 per person (SA)",
    ])
  })

  it("gives a child fare only to children and an adult fare only to adults", () => {
    const meta = groups(2)
    const lines = [
      trainFare(20_000, meta, [ref({ index: 0, adults: 1, children: 1, groups: ["g1"] }), ref({ index: 1, adults: 1, groups: ["g2"] })]),
      trainFare(6_000, meta, [ref({ index: 0, adults: 1, children: 1, groups: ["g1"] })], { passengerKind: "child" }),
    ]
    const result = allocatePaxGroups({ lines, target: 26_000 })
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 1 Adult x R10 000,00 & 1 Child x R6 000,00",
      "Twin Deluxe Suite 2 - 1 Adult x R10 000,00",
    ])
  })

  it("flags a guest alone in a suite with the single supplement, before the rate tag", () => {
    const meta = groups(2)
    const lines = [
      trainFare(40_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"] })], { rateTypeId: "rate-sa" }),
      trainFare(27_000, meta, [ref({ index: 1, adults: 1, groups: ["g2"] })], {
        rateTypeId: "rate-sa",
        singleSupplementPct: 35,
      }),
    ]
    const result = allocatePaxGroups({ lines, target: 67_000, rateLabels: RATE_LABELS })
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R20 000,00 per person (SA)",
      "Twin Deluxe Suite 2 - 1 Adult x R27 000,00 (single, supplement incl.) (SA)",
    ])
    expect(result?.lines[1].parts[0].supplement).toBe(true)
  })

  it("splits a unit's own cost among its occupants and a shared tour unit across everyone", () => {
    const meta = groups(2)
    const lines = [
      trainFare(20_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"] }), ref({ index: 1, adults: 2, groups: ["g2"] })]),
      // A typed tour price for suite 2's own party.
      unitLine(3_000, "tour_operator", "leg-tour", "per person", [ref({ index: 0, adults: 2, groups: ["g2"] })], {
        manualTourPrice: 3_000,
      }),
      // A tour party shared by every suite.
      unitLine(2_000, "tour_operator", "leg-tour-2", "per person", [ref({ index: 0, adults: 4 })], {
        manualTourPrice: 2_000,
      }),
    ]
    expect(allocatePaxGroups({ lines, target: 25_000 })?.lines.map((groupLine) => groupLine.subtotal)).toEqual([
      11_000, 14_000,
    ])
  })

  it("splits a hotel per-person fare by kind across the groups the room serves", () => {
    const meta = groups(3)
    const lines = [
      trainFare(30_000, meta, [
        ref({ index: 0, adults: 2, groups: ["g1"] }),
        ref({ index: 1, adults: 1, groups: ["g2"] }),
        ref({ index: 2, children: 1, groups: ["g3"] }),
      ]),
      unitLine(4_000, "hotel_property", "leg-hotel", "per person per night", [ref({ index: 0, adults: 1, children: 1, groups: ["g2", "g3"] })]),
      unitLine(1_000, "hotel_property", "leg-hotel", "per person per night", [ref({ index: 0, adults: 1, children: 1, groups: ["g2", "g3"] })], {
        passengerKind: "child",
      }),
    ]
    // The room serves suites 2 and 3: suite 2's adult takes its adult fare, suite 3's child its child fare.
    const result = allocatePaxGroups({ lines, target: 35_000 })
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([20_000, 14_000, 1_000])
  })

  it("builds each primary guest once across the adult, child and infant lines of one suite", () => {
    const meta = groups(2)
    const suite1 = ref({ index: 0, unitId: "u1", adults: 2, children: 1, infants: 1, groups: ["g1"] })
    const lines = [
      trainFare(20_000, meta, [suite1, ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"] })]),
      trainFare(5_000, meta, [suite1], { passengerKind: "child" }),
      trainFare(0, meta, [suite1], { passengerKind: "infant" }),
    ]
    const result = allocatePaxGroups({ lines, target: 25_000 })
    expect(result?.lines.map((groupLine) => [groupLine.adults, groupLine.children])).toEqual([
      [2, 1],
      [1, 0],
    ])
    // R6 666,67 a head is a cent too much over three adults. Suite 2's lone adult prints the same
    // price as suite 1's adults, so suite 1's child — priced like no one else — gives it back.
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([18_333.33, 6_666.67])
    expect(result?.lines[0].parts.map((part) => part.perPerson)).toEqual([6_666.67, 4_999.99])
    expectAddsUp(result, 25_000)
  })

  it("falls back to the line's rate type when a primary ref carries none", () => {
    const meta = groups(2)
    const lines = [
      trainFare(10_000, meta, [ref({ index: 0, adults: 1, groups: ["g1"] })], { rateTypeId: "rate-tw" }),
      trainFare(8_000, meta, [ref({ index: 1, adults: 1, groups: ["g2"] })], { rateTypeId: "rate-sa" }),
    ]
    const result = allocatePaxGroups({ lines, target: 18_000, rateLabels: RATE_LABELS })
    expect(result?.lines.map((groupLine) => groupLine.parts[0].rateTypeId)).toEqual(["rate-tw", "rate-sa"])
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 1 Adult x R10 000,00 (TW)",
      "Twin Deluxe Suite 2 - 1 Adult x R8 000,00 (SA)",
    ])
  })

  it("orders groups by position and parts adults first, then by rate label, then supplement", () => {
    const meta = [
      { id: "g2", position: 2, label: "Suite B" },
      { id: "g1", position: 1, label: "Suite A" },
    ]
    // Suite B's base slice (SA) holds an adult and a child; one adult each moved to TW and to an
    // unlabelled rate.
    const baseSlice = ref({ index: 1, unitId: "u2", adults: 1, children: 1, groups: ["g2"], rate: "rate-sa" })
    const lines = [
      trainFare(6_000, meta, [baseSlice], { passengerKind: "child" }),
      trainFare(9_000, meta, [ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"], rate: "rate-tw" })]),
      trainFare(8_000, meta, [baseSlice]),
      trainFare(7_000, meta, [ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"], rate: "rate-null" })]),
      trainFare(5_000, meta, [ref({ index: 0, unitId: "u1", adults: 1, groups: ["g1"], rate: "rate-sa" })]),
    ]
    const result = allocatePaxGroups({ lines, target: 35_000, rateLabels: RATE_LABELS })
    expect(sentences(result)).toEqual([
      "Suite A - 1 Adult x R5 000,00 (SA)",
      "Suite B - 1 Adult x R8 000,00 (SA) & 1 Adult x R9 000,00 (TW) & 1 Adult x R7 000,00 & 1 Child x R6 000,00 (SA)",
    ])
  })

  it("prints nothing for a blank short label", () => {
    const meta = groups(2)
    const lines = [
      trainFare(4_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"], rate: "rate-blank" })]),
      trainFare(4_000, meta, [ref({ index: 1, children: 2, groups: ["g2"], rate: "rate-unknown" })], {
        passengerKind: "child",
      }),
    ]
    const result = allocatePaxGroups({ lines, target: 8_000, rateLabels: RATE_LABELS })
    expect(result?.lines.map((groupLine) => groupLine.parts[0].rateLabel)).toEqual([null, null])
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R2 000,00 per person",
      "Twin Deluxe Suite 2 - 2 Children x R2 000,00 per child",
    ])
  })

  it("hands the rounding cent of awkward thirds to a guest priced on their own", () => {
    const meta = groups(2)
    const lines = [
      trainFare(0, meta, [ref({ index: 0, adults: 2, groups: ["g1"] }), ref({ index: 1, adults: 1, groups: ["g2"] })]),
      transfer(1_000),
    ]
    const result = allocatePaxGroups({ lines, target: 1_000 })
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R333,33 per person",
      "Twin Deluxe Suite 2 - 1 Adult x R333,34",
    ])
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([666.66, 333.34])
    expectAddsUp(result, 1_000)
  })

  it("prefers the highest-priced guest on their own for the cent", () => {
    const meta = groups(3)
    const lines = [
      trainFare(9_000, meta, [ref({ index: 0, adults: 1, groups: ["g1"] })]),
      trainFare(7_000, meta, [ref({ index: 1, adults: 1, groups: ["g2"] })]),
      trainFare(6_000, meta, [ref({ index: 2, adults: 2, groups: ["g3"] })]),
      transfer(1_000),
    ]
    const result = allocatePaxGroups({ lines, target: 23_000 })
    // R1 000 over 4 = R250 exactly, so make it awkward with a target that does not divide.
    expect(result?.lines.map((groupLine) => groupLine.subtotal)).toEqual([9_250, 7_250, 6_500])
    const awkward = allocatePaxGroups({ lines, target: 23_000.01 })
    expect(awkward?.lines.map((groupLine) => groupLine.parts.map((part) => [part.count, part.perPerson]))).toEqual([
      [[1, 9_250.01]],
      [[1, 7_250]],
      [[2, 3_250]],
    ])
    expectAddsUp(awkward, 23_000.01)
  })

  it("never hands the cent to a child sharing free", () => {
    const meta = groups(2)
    const lines = [
      trainFare(200, meta, [ref({ index: 0, adults: 3, groups: ["g1"] })]),
      trainFare(0, meta, [ref({ index: 1, children: 1, groups: ["g2"] })], { passengerKind: "child" }),
    ]
    const result = allocatePaxGroups({ lines, target: 200 })
    expect(result?.lines[1].parts).toEqual([
      { kind: "child", count: 1, perPerson: 0, rateTypeId: null, rateLabel: null, supplement: false },
    ])
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 2 Adults x R66,67 per person & 1 Adult x R66,66",
      "Twin Deluxe Suite 2 - 1 Child x R0,00",
    ])
    expectAddsUp(result, 200)
  })

  it("splits one guest off a bucket when no guest is priced on their own", () => {
    const meta = groups(3)
    const lines = [
      trainFare(0, meta, [
        ref({ index: 0, adults: 2, groups: ["g1"] }),
        ref({ index: 1, adults: 2, groups: ["g2"] }),
        ref({ index: 2, adults: 2, groups: ["g3"] }),
      ]),
      transfer(1_000),
    ]
    const result = allocatePaxGroups({ lines, target: 1_000 })
    // R1 000 over 6 is R166,67 a head, R0,02 too much: one guest of suite 1 takes it back.
    expect(sentences(result)).toEqual([
      "Twin Deluxe Suite 1 - 1 Adult x R166,67 & 1 Adult x R166,65",
      "Twin Deluxe Suite 2 - 2 Adults x R166,67 per person",
      "Twin Deluxe Suite 3 - 2 Adults x R166,67 per person",
    ])
    expectAddsUp(result, 1_000)
  })

  it("splits the bucket of the highest-subtotal group", () => {
    const meta = groups(2)
    const lines = [
      trainFare(1_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"] })]),
      trainFare(2_000, meta, [ref({ index: 1, adults: 2, groups: ["g2"] })]),
      transfer(1),
    ]
    // R1 over 4 is R0,25 a head; scaled to R3 001,01 the odd cent has nowhere single to go.
    const result = allocatePaxGroups({ lines, target: 3_001.01 })
    expectAddsUp(result, 3_001.01)
    expect(result?.lines[0].parts).toHaveLength(1)
    expect(result?.lines[1].parts.map((part) => part.count)).toEqual([1, 1])
  })

  describe("identical guests", () => {
    /**
     * Five suites like the demo booking: suite 1's pair has its own hotel room, suites 2 and 3 are
     * identical (one SA and one TW guest each), suites 4 and 5 hold two children each, and a minibus
     * shared by all ten guests comes to R99,996 a head — rounding up 10 times, 4c too much.
     */
    function demoLike(): { lines: PaxGroupPricingLine[]; target: number } {
      const meta = groups(5)
      const train = (total: number, refs: PricingUnitRef[], extra: Partial<PricingSnapshot>) =>
        trainFare(total, meta, refs, extra)
      const lines = [
        train(
          40_000,
          [
            ref({ index: 0, unitId: "u1", adults: 2, groups: ["g1"], rate: "rate-sa" }),
            ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"], rate: "rate-sa" }),
            ref({ index: 2, unitId: "u3", adults: 1, groups: ["g3"], rate: "rate-sa" }),
          ],
          { rateTypeId: "rate-sa" },
        ),
        train(
          24_000,
          [
            ref({ index: 1, unitId: "u2", adults: 1, groups: ["g2"], rate: "rate-tw" }),
            ref({ index: 2, unitId: "u3", adults: 1, groups: ["g3"], rate: "rate-tw" }),
          ],
          { rateTypeId: "rate-tw" },
        ),
        train(16_000, [ref({ index: 3, unitId: "u4", children: 2, groups: ["g4"], rate: "rate-tw" })], {
          rateTypeId: "rate-tw",
          passengerKind: "child",
        }),
        train(14_000, [ref({ index: 4, unitId: "u5", children: 2, groups: ["g5"], rate: "rate-sa" })], {
          rateTypeId: "rate-sa",
          passengerKind: "child",
        }),
        hotelRoom(2_000, [ref({ index: 0, unitId: "h1", adults: 2, groups: ["g1"] })]),
        transfer(999.96),
      ]
      return { lines, target: 96_999.96 }
    }

    it("prints one price for identical guests in different suites", () => {
      const { lines, target } = demoLike()
      const result = allocatePaxGroups({ lines, target, rateLabels: RATE_LABELS })
      expect(result?.lines[1].parts).toEqual(result?.lines[2].parts)
      expect(result?.lines[1].subtotal).toBe(result?.lines[2].subtotal)
      expectAddsUp(result, target)
    })

    it("puts the cents on a suite whose price no other suite shares, divided evenly", () => {
      const { lines, target } = demoLike()
      const result = allocatePaxGroups({ lines, target, rateLabels: RATE_LABELS })
      // -4c over suite 1's two adults: 2 × R11 099,98, not one odd guest.
      expect(sentences(result)).toEqual([
        "Twin Deluxe Suite 1 - 2 Adults x R11 099,98 per person (SA)",
        "Twin Deluxe Suite 2 - 1 Adult x R10 100,00 (SA) & 1 Adult x R12 100,00 (TW)",
        "Twin Deluxe Suite 3 - 1 Adult x R10 100,00 (SA) & 1 Adult x R12 100,00 (TW)",
        "Twin Deluxe Suite 4 - 2 Children x R8 100,00 per child (TW)",
        "Twin Deluxe Suite 5 - 2 Children x R7 100,00 per child (SA)",
      ])
      expectAddsUp(result, target)
    })

    it("prefers a guest priced on their own with no twin over a divisible bucket", () => {
      const meta = groups(4)
      const lines = [
        trainFare(20_000, meta, [ref({ index: 0, adults: 2, groups: ["g1"] })]),
        trainFare(9_000, meta, [ref({ index: 1, adults: 1, groups: ["g2"] })]),
        trainFare(7_000, meta, [ref({ index: 2, adults: 1, groups: ["g3"] })]),
        trainFare(10_000, meta, [ref({ index: 3, adults: 2, groups: ["g4"] })]),
        // R16,667 a head over six guests rounds up six times: 2c too much.
        transfer(100),
      ]
      const result = allocatePaxGroups({ lines, target: 46_100 })
      // Suite 1's pair would take it evenly, but a guest on their own comes first.
      expect(result?.lines.map((groupLine) => groupLine.parts.map((part) => [part.count, part.perPerson]))).toEqual([
        [[2, 10_016.67]],
        [[1, 9_016.65]],
        [[1, 7_016.67]],
        [[2, 5_016.67]],
      ])
      expectAddsUp(result, 46_100)
    })
  })

  it("keeps every subtotal exact over many awkward splits", () => {
    const meta = groups(4)
    const lines = [
      trainFare(10_000.01, meta, [
        ref({ index: 0, adults: 2, groups: ["g1"] }),
        ref({ index: 1, adults: 2, groups: ["g2"] }),
        ref({ index: 2, adults: 1, groups: ["g3"] }),
      ]),
      trainFare(3_333.33, meta, [ref({ index: 3, children: 3, groups: ["g4"] })], { passengerKind: "child" }),
      transfer(777.77, ["g1", "g4"]),
      transfer(101.01),
      hotelRoom(999.99, [ref({ index: 0, adults: 3, groups: ["g2", "g3"] })]),
      commission(1_234.56),
    ]
    for (const target of [16_446.67, 16_446.68, 16_500, 20_000.03, 1]) {
      expectAddsUp(allocatePaxGroups({ lines, target }), target)
    }
  })

  describe("returns null", () => {
    const meta = groups(2)
    const primary = trainFare(20_000, meta, [
      ref({ index: 0, adults: 1, groups: ["g1"] }),
      ref({ index: 1, adults: 1, groups: ["g2"] }),
    ])

    it("when no line carries pax groups", () => {
      const lines = [unitLine(20_000, "train_operator", "leg-train", "per person sharing", [ref({ index: 0, adults: 2 })])]
      expect(allocatePaxGroups({ lines, target: 20_000 })).toBeNull()
    })

    it("when the lines carry a single group", () => {
      const lines = [trainFare(20_000, groups(1), [ref({ index: 0, adults: 2, groups: ["g1"] })])]
      expect(allocatePaxGroups({ lines, target: 20_000 })).toBeNull()
    })

    it("when a unit line has no unitRefs", () => {
      expect(allocatePaxGroups({ lines: [primary, hotelRoom(4_000, undefined as unknown as PricingUnitRef[])], target: 24_000 })).toBeNull()
      expect(allocatePaxGroups({ lines: [primary, hotelRoom(4_000, [])], target: 24_000 })).toBeNull()
    })

    it("when the target is zero, negative or not a number", () => {
      expect(allocatePaxGroups({ lines: [primary], target: 0 })).toBeNull()
      expect(allocatePaxGroups({ lines: [primary], target: -5 })).toBeNull()
      expect(allocatePaxGroups({ lines: [primary], target: Number.NaN })).toBeNull()
    })

    it("when a primary unit names no known group", () => {
      const orphan = trainFare(20_000, meta, [ref({ index: 0, adults: 1, groups: ["g1"] }), ref({ index: 1, adults: 1 })])
      const stranger = trainFare(20_000, meta, [ref({ index: 0, adults: 1, groups: ["g1"] }), ref({ index: 1, adults: 1, groups: ["gx"] })])
      expect(allocatePaxGroups({ lines: [orphan], target: 20_000 })).toBeNull()
      expect(allocatePaxGroups({ lines: [stranger], target: 20_000 })).toBeNull()
    })

    it("when a group has no paying guest", () => {
      const infantSuite = trainFare(20_000, meta, [
        ref({ index: 0, adults: 2, groups: ["g1"] }),
        ref({ index: 1, infants: 1, groups: ["g2"] }),
      ])
      expect(allocatePaxGroups({ lines: [infantSuite], target: 20_000 })).toBeNull()
    })

    it("when the primary leg's lines carry no unit refs to build guests from", () => {
      const fixed = line(0, { supplierKind: "train_operator", legId: "leg-train", pricingMode: "fixed_package", paxGroups: meta })
      expect(allocatePaxGroups({ lines: [fixed, line(20_000, { unit: "per person" })], target: 20_000 })).toBeNull()
    })

    it("when nothing is priced", () => {
      expect(allocatePaxGroups({ lines: [trainFare(0, meta, [ref({ index: 0, adults: 1, groups: ["g1"] }), ref({ index: 1, adults: 1, groups: ["g2"] })])], target: 100 })).toBeNull()
    })
  })
})

describe("formatPaxGroupLine / formatPaxGroupParts", () => {
  const groupLine = (parts: PaxGroupPriceLine["parts"]): PaxGroupPriceLine => ({
    groupId: "g2",
    position: 2,
    label: "Twin Deluxe Suite 2",
    parts,
    subtotal: 0,
    adults: 0,
    children: 0,
  })
  const part = (overrides: Partial<PaxGroupPriceLine["parts"][number]>): PaxGroupPriceLine["parts"][number] => ({
    kind: "adult",
    count: 1,
    perPerson: 24_100,
    rateTypeId: null,
    rateLabel: null,
    supplement: false,
    ...overrides,
  })

  it("words one adult, several adults, one child and several children", () => {
    expect(formatPaxGroupParts(groupLine([part({})]), money)).toBe("1 Adult x R24 100,00")
    expect(formatPaxGroupParts(groupLine([part({ count: 2, perPerson: 23_800 })]), money)).toBe(
      "2 Adults x R23 800,00 per person",
    )
    expect(formatPaxGroupParts(groupLine([part({ kind: "child", perPerson: 18_900 })]), money)).toBe(
      "1 Child x R18 900,00",
    )
    expect(formatPaxGroupParts(groupLine([part({ kind: "child", count: 2, perPerson: 18_900 })]), money)).toBe(
      "2 Children x R18 900,00 per child",
    )
  })

  it("adds the supplement, then the rate label, and joins parts with an ampersand", () => {
    const line = groupLine([
      part({ rateLabel: "SA" }),
      part({ perPerson: 29_400, rateLabel: "TW" }),
      part({ perPerson: 35_000, supplement: true, rateLabel: " TW " }),
      part({ count: 2, perPerson: 1_000, supplement: true }),
      part({ perPerson: 5, rateLabel: "  " }),
    ])
    expect(formatPaxGroupLine(line, money)).toBe(
      "Twin Deluxe Suite 2 - 1 Adult x R24 100,00 (SA) & 1 Adult x R29 400,00 (TW) & " +
        "1 Adult x R35 000,00 (single, supplement incl.) (TW) & " +
        "2 Adults x R1 000,00 per person (single, supplement incl.) & 1 Adult x R5,00",
    )
  })

  it("uses the caller's money formatter", () => {
    const line = groupLine([part({ count: 2, perPerson: 23_800, rateLabel: "SA" })])
    expect(formatPaxGroupLine(line, (n) => `R${n.toFixed(2)}`)).toBe(
      "Twin Deluxe Suite 2 - 2 Adults x R23800.00 per person (SA)",
    )
  })

  it("holds each count to its guests and each x to its price for print, without rate labels", () => {
    const line = groupLine([part({ rateLabel: "SA" }), part({ kind: "child", count: 2, perPerson: 18_900 })])
    expect(formatPaxGroupLineForPrint(line, (n) => `R${n}`)).toBe(
      "Twin Deluxe Suite 2 - 1 Adult x R24100 & 2 Children x R18900 per child",
    )
  })
})

describe("formatPaxGroupPartLines", () => {
  const part = (overrides: Partial<PaxGroupPriceLine["parts"][number]>): PaxGroupPriceLine["parts"][number] => ({
    kind: "adult",
    count: 1,
    perPerson: 24_100,
    rateTypeId: null,
    rateLabel: null,
    supplement: false,
    ...overrides,
  })

  it("gives one line per part for a narrow column, without the ampersand or the suite name", () => {
    const line: PaxGroupPriceLine = {
      groupId: "g2",
      position: 2,
      label: "Twin Deluxe Suite 2",
      parts: [
        part({ perPerson: 41_939.17, rateLabel: "SA" }),
        part({ perPerson: 65_339.13, rateLabel: "TW" }),
        part({ kind: "child", count: 2, perPerson: 18_900, supplement: true }),
      ],
      subtotal: 0,
      adults: 2,
      children: 2,
    }
    expect(formatPaxGroupPartLines(line, money).map((text) => text.replace(/ /g, " "))).toEqual([
      "1 Adult x R41 939,17 (SA)",
      "1 Adult x R65 339,13 (TW)",
      "2 Children x R18 900,00 per child (single, supplement incl.)",
    ])
    expect(formatPaxGroupPartLines(line, (n) => `R${n}`)[0]).toBe("1 Adult x R41939.17 (SA)")
  })
})

describe("readPaxGroups", () => {
  it("reads the groups off the primary lines in position order, naming a blank label by position", () => {
    const lines = [
      transfer(100),
      trainFare(1, [
        { id: "g2", position: 2, label: " " },
        { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
      ], [ref({ index: 0, adults: 1, groups: ["g1"] })]),
    ]
    expect(readPaxGroups(lines)).toEqual([
      { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
      { id: "g2", position: 2, label: "Suite 2" },
    ])
  })

  it("is null with fewer than two groups", () => {
    expect(readPaxGroups([transfer(100)])).toBeNull()
    expect(readPaxGroups([trainFare(1, groups(1), [])])).toBeNull()
  })
})

describe("paxGroupScopeTag", () => {
  const meta = groups(4)
  const lines = [
    trainFare(40_000, meta, [
      ref({ index: 0, adults: 2, groups: ["g1"] }),
      ref({ index: 1, adults: 2, groups: ["g2"] }),
      ref({ index: 2, adults: 2, groups: ["g3"] }),
      ref({ index: 3, adults: 2, groups: ["g4"] }),
    ]),
    // Suite 2's own flight.
    unitLine(5_000, "airline", "leg-flight", "per person", [ref({ index: 0, adults: 2, groups: ["g2"] })]),
    // An apartment for suites 2 and 3.
    hotelRoom(8_000, [ref({ index: 0, adults: 4, groups: ["g2", "g3"] })], { legId: "leg-apartment" }),
    // A hotel whose rooms serve suites 1, 2 and 4 between them.
    hotelRoom(4_000, [ref({ index: 0, adults: 2, groups: ["g1"] })], { legId: "leg-hotel-b" }),
    hotelRoom(4_000, [ref({ index: 1, adults: 2, groups: ["g4", "g2"] })], { legId: "leg-hotel-b" }),
    // A hotel every suite stays at: one shared room and the rest listed explicitly.
    hotelRoom(4_000, [ref({ index: 0, adults: 8 })], { legId: "leg-hotel-all" }),
    hotelRoom(4_000, [ref({ index: 0, adults: 4, groups: ["g1", "g2"] })], { legId: "leg-hotel-listed" }),
    hotelRoom(4_000, [ref({ index: 1, adults: 4, groups: ["g3", "g4"] })], { legId: "leg-hotel-listed" }),
    transfer(1_000, ["g3"], "tr-suite-3"),
    transfer(1_000, [], "tr-everyone"),
    transfer(1_000, undefined, "tr-legacy"),
    commission(500),
  ]

  it("names one suite", () => {
    expect(paxGroupScopeTag(lines, "leg-flight")).toBe("(Suite 2 only)")
    expect(paxGroupScopeTag(lines, "tr-suite-3")).toBe("(Suite 3 only)")
  })

  it("names two suites with an ampersand", () => {
    expect(paxGroupScopeTag(lines, "leg-apartment")).toBe("(Suites 2 & 3 only)")
  })

  it("names three or more suites as a list, in position order", () => {
    expect(paxGroupScopeTag(lines, "leg-hotel-b")).toBe("(Suites 1, 2 & 4 only)")
  })

  it("names a run of three or more suites as a range", () => {
    const meta = groups(6)
    const runLines = [
      trainFare(1_000, meta, meta.map((group, index) => ref({ index, adults: 1, groups: [group.id] }))),
      transfer(100, ["g1", "g2", "g3", "g4", "g5"], "tr-run"),
      transfer(100, ["g2", "g3"], "tr-pair"),
    ]
    expect(paxGroupScopeTag(runLines, "tr-run")).toBe("(Suites 1–5 only)")
    expect(paxGroupScopeTag(runLines, "tr-pair")).toBe("(Suites 2 & 3 only)")
  })

  it("is null when the leg or request serves every suite", () => {
    expect(paxGroupScopeTag(lines, "leg-train")).toBeNull()
    expect(paxGroupScopeTag(lines, "leg-hotel-all")).toBeNull()
    expect(paxGroupScopeTag(lines, "leg-hotel-listed")).toBeNull()
    expect(paxGroupScopeTag(lines, "tr-everyone")).toBeNull()
    expect(paxGroupScopeTag(lines, "tr-legacy")).toBeNull()
    // The transfer leg as a whole carries an unassigned trip.
    expect(paxGroupScopeTag(lines, "leg-transfer")).toBeNull()
  })

  it("is null for an unknown or missing id", () => {
    expect(paxGroupScopeTag(lines, "leg-nowhere")).toBeNull()
    expect(paxGroupScopeTag(lines, null)).toBeNull()
    expect(paxGroupScopeTag(lines, undefined)).toBeNull()
  })

  it("is null on a booking with no groups", () => {
    const plain = [
      unitLine(5_000, "airline", "leg-flight", "per person", [ref({ index: 0, adults: 2, groups: ["g2"] })]),
    ]
    expect(paxGroupScopeTag(plain, "leg-flight")).toBeNull()
    expect(paxGroupScopeTag([], "leg-flight")).toBeNull()
  })

  it("is null for a leg with a line built before unit refs", () => {
    const legacy = [...lines, hotelRoom(1_000, undefined as unknown as PricingUnitRef[], { legId: "leg-flight" })]
    expect(paxGroupScopeTag(legacy, "leg-flight")).toBeNull()
  })

  it("names the groups with the primary product's noun", () => {
    expect(paxGroupScopeTag(lines, "leg-flight", "Room")).toBe("(Room 2 only)")
    expect(paxGroupScopeTag(lines, "leg-apartment", "Cabin")).toBe("(Cabins 2 & 3 only)")
    expect(paxGroupScopeTag(lines, "leg-hotel-b", "Room")).toBe("(Rooms 1, 2 & 4 only)")
    // A blank noun keeps the default rather than printing "( 2 only)".
    expect(paxGroupScopeTag(lines, "leg-flight", "  ")).toBe("(Suite 2 only)")
  })
})

describe("paxGroupNoun", () => {
  it("follows the primary supplier kind's vocabulary, capitalised", () => {
    expect(paxGroupNoun("train_operator")).toBe("Suite")
    expect(paxGroupNoun("hotel_property")).toBe("Room")
    expect(paxGroupNoun("cruise_line")).toBe("Cabin")
  })

  it("defaults to Suite when the kind is unknown", () => {
    expect(paxGroupNoun(null)).toBe("Suite")
    expect(paxGroupNoun(undefined)).toBe("Suite")
    expect(paxGroupNoun("not_a_kind" as SupplierKind)).toBe("Suite")
  })
})
