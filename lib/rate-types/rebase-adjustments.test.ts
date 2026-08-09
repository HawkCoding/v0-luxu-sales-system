import { describe, expect, it } from "vitest"
import { rebaseRateAdjustments } from "./rebase-adjustments"

const BLUE_TRAIN = "rate-blue-train-domestic"
const ROVOS = "rate-rovos-sadc"
const STO = "rate-sto"

describe("rebaseRateAdjustments", () => {
  it("drops the incoming default, carries the outgoing one at 0%, and zeroes the rest", () => {
    // The screenshot's supplier: Blue Train Domestic is the baseline, Rovos is 50% off it,
    // STO is 20% off it. Switching the baseline to Rovos.
    const next = rebaseRateAdjustments(
      [
        { rateTypeId: ROVOS, discountPct: 50 },
        { rateTypeId: STO, discountPct: 20 },
      ],
      BLUE_TRAIN,
      ROVOS,
    )

    expect(next).toEqual([
      { rateTypeId: BLUE_TRAIN, discountPct: 0 },
      { rateTypeId: STO, discountPct: 0 },
    ])
  })

  it("never leaves the new default listed as its own adjustment", () => {
    const next = rebaseRateAdjustments([{ rateTypeId: STO, discountPct: 20 }], BLUE_TRAIN, STO)
    expect(next.some((adjustment) => adjustment.rateTypeId === STO)).toBe(false)
    expect(next).toEqual([{ rateTypeId: BLUE_TRAIN, discountPct: 0 }])
  })

  it("does not duplicate the outgoing default when it was already listed", () => {
    const next = rebaseRateAdjustments(
      [
        { rateTypeId: BLUE_TRAIN, discountPct: 10 },
        { rateTypeId: ROVOS, discountPct: 50 },
      ],
      BLUE_TRAIN,
      ROVOS,
    )
    expect(next.filter((adjustment) => adjustment.rateTypeId === BLUE_TRAIN)).toHaveLength(1)
    expect(next).toEqual([{ rateTypeId: BLUE_TRAIN, discountPct: 0 }])
  })

  it("carries nothing when there was no previous default", () => {
    const next = rebaseRateAdjustments([{ rateTypeId: STO, discountPct: 20 }], null, ROVOS)
    expect(next).toEqual([{ rateTypeId: STO, discountPct: 0 }])
  })

  it("is a no-op on the rows when the default does not actually change", () => {
    const next = rebaseRateAdjustments([{ rateTypeId: STO, discountPct: 20 }], ROVOS, ROVOS)
    expect(next).toEqual([{ rateTypeId: STO, discountPct: 0 }])
  })

  it("handles an empty adjustment list", () => {
    expect(rebaseRateAdjustments([], BLUE_TRAIN, ROVOS)).toEqual([
      { rateTypeId: BLUE_TRAIN, discountPct: 0 },
    ])
  })
})
