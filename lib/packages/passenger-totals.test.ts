import { describe, expect, it } from "vitest"
import { distributePassengerTotals, projectPassengerTotals, resolveAdultsOnlyDelta } from "@/lib/packages/passenger-totals"
import type { AgeBuckets } from "@/lib/pricing/age-buckets"

const totals = (adultCount: number, childCount = 0, infantCount = 0) => ({
  adultCount,
  childCount,
  infantCount,
})

const DEFAULT_BUCKETS: AgeBuckets = { infantMax: 2, childMax: 12 }

describe("distributePassengerTotals", () => {
  it("splits evenly when the total divides across the units", () => {
    expect(distributePassengerTotals(totals(4), 2)).toEqual([totals(2), totals(2)])
  })

  it("gives the remainder to the earlier units", () => {
    expect(distributePassengerTotals(totals(3), 2)).toEqual([totals(2), totals(1)])
    expect(distributePassengerTotals(totals(5), 3)).toEqual([totals(2), totals(2), totals(1)])
  })

  it("puts everything on the single unit when there is only one", () => {
    expect(distributePassengerTotals(totals(2, 1, 1), 1)).toEqual([totals(2, 1, 1)])
  })

  it("splits each age bucket independently", () => {
    expect(distributePassengerTotals(totals(2, 1, 1), 2)).toEqual([
      totals(1, 1, 1),
      totals(1, 0, 0),
    ])
  })

  it("still fills every unit when there are fewer passengers than units", () => {
    expect(distributePassengerTotals(totals(1), 3)).toEqual([totals(1), totals(0), totals(0)])
  })

  it("always sums back to the booking totals", () => {
    const split = distributePassengerTotals(totals(7, 3, 2), 4)
    const summed = split.reduce(
      (acc, unit) => ({
        adultCount: acc.adultCount + unit.adultCount,
        childCount: acc.childCount + unit.childCount,
        infantCount: acc.infantCount + unit.infantCount,
      }),
      totals(0),
    )
    expect(summed).toEqual(totals(7, 3, 2))
  })

  it("returns nothing when there are no units to spread across", () => {
    expect(distributePassengerTotals(totals(2), 0)).toEqual([])
  })
})

describe("projectPassengerTotals", () => {
  it("passes plain adults/children through with no ages", () => {
    expect(
      projectPassengerTotals({ noOfAdults: 2, noOfChildren: 1, childAges: [] }, DEFAULT_BUCKETS),
    ).toEqual(totals(2, 1, 0))
  })

  it("buckets an age at or below infantMax as an infant", () => {
    expect(
      projectPassengerTotals({ noOfAdults: 2, noOfChildren: 1, childAges: [2] }, DEFAULT_BUCKETS),
    ).toEqual(totals(2, 0, 1))
  })

  it("promotes an age past childMax to an adult", () => {
    expect(
      projectPassengerTotals({ noOfAdults: 2, noOfChildren: 1, childAges: [15] }, DEFAULT_BUCKETS),
    ).toEqual(totals(3, 0, 0))
  })

  it("boundary ages: exactly infantMax is infant, exactly childMax is child", () => {
    expect(
      projectPassengerTotals({ noOfAdults: 0, noOfChildren: 2, childAges: [2, 12] }, DEFAULT_BUCKETS),
    ).toEqual(totals(0, 1, 1))
  })

  it("an age with no matching child count is invisible (childCount floors at 0)", () => {
    expect(
      projectPassengerTotals({ noOfAdults: 2, noOfChildren: 0, childAges: [5] }, DEFAULT_BUCKETS),
    ).toEqual(totals(2, 0, 0))
  })

  it("more ages than noOfChildren overruns — infants can exceed the declared child count", () => {
    expect(
      projectPassengerTotals({ noOfAdults: 2, noOfChildren: 1, childAges: [1, 2] }, DEFAULT_BUCKETS),
    ).toEqual(totals(2, 0, 2))
  })
})

describe("resolveAdultsOnlyDelta", () => {
  it("returns the adult delta when children and infants already match", () => {
    expect(resolveAdultsOnlyDelta(totals(2, 1, 0), totals(4, 1, 0))).toBe(2)
    expect(resolveAdultsOnlyDelta(totals(4, 1, 0), totals(2, 1, 0))).toBe(-2)
    expect(resolveAdultsOnlyDelta(totals(2, 1, 0), totals(2, 1, 0))).toBe(0)
  })

  it("returns null when the child count also differs", () => {
    expect(resolveAdultsOnlyDelta(totals(2, 1, 0), totals(4, 0, 0))).toBeNull()
  })

  it("returns null when the infant count also differs", () => {
    expect(resolveAdultsOnlyDelta(totals(2, 0, 1), totals(4, 0, 0))).toBeNull()
  })

  // Regression for the sync bug: the old code wrote `summed.adultCount` as an absolute value.
  // Since child_ages (and therefore adultPromotedCount) never changes, writing an absolute value
  // re-projects to noOfAdults + adultPromotedCount, which only equals summed.adultCount when
  // adultPromotedCount is 0 — otherwise every "sync" click drifts further from the target.
  // The delta is the only value for which one write converges, for any child_ages.
  it.each([
    { name: "no ages", childAges: [] },
    { name: "one promoted adult", childAges: [15] },
    { name: "one infant", childAges: [1] },
    { name: "mixed infant + promoted adult", childAges: [1, 15] },
    { name: "one plain child", childAges: [6] },
  ])("converges in one write to the target for $name", ({ childAges }) => {
    const booking = { noOfAdults: 2, noOfChildren: childAges.length, childAges }
    const before = projectPassengerTotals(booking, DEFAULT_BUCKETS)
    // Simulate the salesperson typing a bigger adult split into the suites.
    const target = { ...before, adultCount: before.adultCount + 2 }

    const delta = resolveAdultsOnlyDelta(before, target)
    expect(delta).not.toBeNull()

    const after = projectPassengerTotals(
      { ...booking, noOfAdults: booking.noOfAdults + (delta ?? 0) },
      DEFAULT_BUCKETS,
    )
    expect(after).toEqual(target)
  })
})
