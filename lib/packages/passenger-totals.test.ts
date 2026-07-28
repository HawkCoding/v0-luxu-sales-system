import { describe, expect, it } from "vitest"
import { distributePassengerTotals } from "@/lib/packages/passenger-totals"

const totals = (adultCount: number, childCount = 0, infantCount = 0) => ({
  adultCount,
  childCount,
  infantCount,
})

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
