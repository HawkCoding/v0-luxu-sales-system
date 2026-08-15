import { describe, expect, it } from "vitest"
import { DEFAULT_AGE_BUCKETS } from "@/lib/pricing/age-buckets"
import { ageOnDate, bucketRoster, compareRosterToBooking } from "./roster-pax"

const TRIP = "2026-09-12"

describe("ageOnDate", () => {
  it("counts whole years completed by the reference date", () => {
    expect(ageOnDate("1980-01-01", TRIP)).toBe(46)
    expect(ageOnDate("2016-05-05", TRIP)).toBe(10)
    expect(ageOnDate("2025-08-08", TRIP)).toBe(1)
  })

  it("does not count a birthday that has not happened yet", () => {
    expect(ageOnDate("2016-09-13", TRIP)).toBe(9)
    expect(ageOnDate("2016-09-12", TRIP)).toBe(10)
  })

  it("returns null for unreadable or future dates of birth", () => {
    expect(ageOnDate(null, TRIP)).toBeNull()
    expect(ageOnDate("", TRIP)).toBeNull()
    expect(ageOnDate("not a date", TRIP)).toBeNull()
    expect(ageOnDate("2030-01-01", TRIP)).toBeNull()
  })
})

describe("bucketRoster", () => {
  it("buckets the QA 10 roster (2 adults + child + infant) into pricing pax", () => {
    const roster = bucketRoster(
      [
        { dateOfBirth: "1980-01-01" },
        { dateOfBirth: "1982-03-02" },
        { dateOfBirth: "2016-05-05" },
        { dateOfBirth: "2025-08-08" },
      ],
      DEFAULT_AGE_BUCKETS,
      TRIP,
    )

    expect(roster.noOfAdults).toBe(2)
    expect(roster.noOfChildren).toBe(2)
    expect(roster.childAges).toEqual([10, 1])
    expect(roster.totals).toEqual({ adultCount: 2, childCount: 1, infantCount: 1 })
    expect(roster.undatedCount).toBe(0)
    expect(roster.total).toBe(4)
  })

  it("agrees with the QA 10 boundary ages (2 -> infant, 3 and 12 -> child, 13 -> adult)", () => {
    const roster = bucketRoster(
      [
        { dateOfBirth: "2024-09-12" },
        { dateOfBirth: "2023-09-12" },
        { dateOfBirth: "2014-09-12" },
        { dateOfBirth: "2013-09-12" },
      ],
      DEFAULT_AGE_BUCKETS,
      TRIP,
    )

    expect(roster.childAges).toEqual([2, 3, 12])
    expect(roster.totals).toEqual({ adultCount: 1, childCount: 2, infantCount: 1 })
  })

  it("counts a child with no date of birth without inventing an age", () => {
    const roster = bucketRoster(
      [{ dateOfBirth: "1980-01-01" }, { dateOfBirth: null, isChild: true }],
      DEFAULT_AGE_BUCKETS,
      TRIP,
    )

    expect(roster.noOfAdults).toBe(1)
    expect(roster.noOfChildren).toBe(1)
    expect(roster.childAges).toEqual([])
    expect(roster.totals).toEqual({ adultCount: 1, childCount: 1, infantCount: 0 })
    expect(roster.undatedCount).toBe(1)
  })

  it("treats a guest with neither a date of birth nor the child tick as an adult", () => {
    const roster = bucketRoster([{ dateOfBirth: null }], DEFAULT_AGE_BUCKETS, TRIP)

    expect(roster.totals).toEqual({ adultCount: 1, childCount: 0, infantCount: 0 })
    expect(roster.undatedCount).toBe(1)
  })

  it("honours supplier-style bucket overrides", () => {
    const roster = bucketRoster(
      [{ dateOfBirth: "2016-05-05" }],
      { infantMax: 1, childMax: 5 },
      TRIP,
    )

    expect(roster.totals).toEqual({ adultCount: 1, childCount: 0, infantCount: 0 })
  })
})

describe("compareRosterToBooking", () => {
  const booking = { noOfAdults: 2, noOfChildren: 0, childAges: [] }

  it("reports a match when the roster is the booking's pax", () => {
    const result = compareRosterToBooking(
      [{ dateOfBirth: "1980-01-01" }, { dateOfBirth: "1982-03-02" }],
      booking,
      DEFAULT_AGE_BUCKETS,
      TRIP,
    )

    expect(result.matches).toBe(true)
    expect(result.roster).toEqual({ adultCount: 2, childCount: 0, infantCount: 0, total: 2, undatedCount: 0 })
    expect(result.booking).toEqual({ adultCount: 2, childCount: 0, infantCount: 0, total: 2 })
  })

  it("flags the QA 10 mismatch: 4 guests against a 2-adult booking", () => {
    const result = compareRosterToBooking(
      [
        { dateOfBirth: "1980-01-01" },
        { dateOfBirth: "1982-03-02" },
        { dateOfBirth: "2016-05-05" },
        { dateOfBirth: "2025-08-08" },
      ],
      booking,
      DEFAULT_AGE_BUCKETS,
      TRIP,
    )

    expect(result.matches).toBe(false)
    expect(result.roster?.total).toBe(4)
    expect(result.booking.total).toBe(2)
  })

  it("stays quiet when no guests have been captured yet", () => {
    const result = compareRosterToBooking([], booking, DEFAULT_AGE_BUCKETS, TRIP)

    expect(result.matches).toBe(true)
    expect(result.roster).toBeNull()
  })

  it("flags a head-count match whose age split still disagrees", () => {
    const result = compareRosterToBooking(
      [{ dateOfBirth: "1980-01-01" }, { dateOfBirth: "2016-05-05" }],
      booking,
      DEFAULT_AGE_BUCKETS,
      TRIP,
    )

    expect(result.matches).toBe(false)
    expect(result.roster).toEqual({ adultCount: 1, childCount: 1, infantCount: 0, total: 2, undatedCount: 0 })
  })
})
