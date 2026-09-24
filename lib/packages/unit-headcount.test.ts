import { describe, expect, it } from "vitest"
import {
  describeEmptyUnit,
  describeEmptyUnitSentence,
  findEmptyUnitIndexes,
  PASSENGER_WARN_SUPPLIER_KINDS,
} from "@/lib/packages/unit-headcount"

describe("findEmptyUnitIndexes", () => {
  it("flags a hotel room, airline seat or cruise cabin holding nobody", () => {
    const units = [
      { adultCount: 2, childCount: 0, infantCount: 0 },
      { adultCount: 0, childCount: 0, infantCount: 0 },
      { adultCount: 0, childCount: 1, infantCount: 0 },
      {},
    ]
    for (const kind of PASSENGER_WARN_SUPPLIER_KINDS) {
      expect(findEmptyUnitIndexes(kind, units)).toEqual([1, 3])
    }
  })

  it("counts an infant-only unit as occupied", () => {
    expect(findEmptyUnitIndexes("hotel_property", [{ adultCount: 0, childCount: 0, infantCount: 1 }])).toEqual([])
  })

  it("never flags a train (its exact-sum rule already applies) or a tour (independent activities)", () => {
    const empty = [{ adultCount: 0, childCount: 0, infantCount: 0 }]
    expect(findEmptyUnitIndexes("train_operator", empty)).toEqual([])
    expect(findEmptyUnitIndexes("tour_operator", empty)).toEqual([])
  })

  it("returns nothing when there are no units", () => {
    expect(findEmptyUnitIndexes("airline", [])).toEqual([])
  })
})

describe("describeEmptyUnit", () => {
  it("names the unit in the kind's own noun, 1-based", () => {
    expect(describeEmptyUnit("hotel_property", 1)).toMatch(/^room 2 has nobody in it — add guests or remove the room$/)
  })

  it("has a standalone sentence form", () => {
    expect(describeEmptyUnitSentence("hotel_property", 0)).toBe(
      "Room 1 has nobody in it — add guests or remove the room.",
    )
  })
})
