import { describe, expect, it } from "vitest"

import {
  findRateCardCandidates,
  hasAnyRateCardFor,
  isOngoingRateCard,
  isRateCardValidOn,
  selectRateCard,
  type RateCardWindow,
} from "./resolve"

const ROUTE = "route-vic-falls"
const SUITE = "suite-deluxe"
const RAC = "rate-type-rac"
const STO = "rate-type-sto"

function card(overrides: Partial<RateCardWindow> = {}): RateCardWindow {
  return {
    routeId: ROUTE,
    suiteTypeId: SUITE,
    rateTypeId: RAC,
    validFrom: "2026-01-01",
    validTo: null,
    ...overrides,
  }
}

describe("isOngoingRateCard", () => {
  it("treats null, empty and whitespace-only validTo as ongoing", () => {
    expect(isOngoingRateCard(null)).toBe(true)
    expect(isOngoingRateCard(undefined)).toBe(true)
    expect(isOngoingRateCard("")).toBe(true)
    expect(isOngoingRateCard("   ")).toBe(true)
  })

  it("treats a real date as bounded", () => {
    expect(isOngoingRateCard("2032-12-01")).toBe(false)
  })
})

describe("isRateCardValidOn", () => {
  it("matches a far-future date when the card is ongoing", () => {
    expect(isRateCardValidOn(card({ validTo: null }), "2099-11-20")).toBe(true)
  })

  it("treats an empty-string validTo the same as null", () => {
    expect(isRateCardValidOn(card({ validTo: "" }), "2099-11-20")).toBe(true)
  })

  it("includes both bounds", () => {
    const bounded = card({ validFrom: "2026-01-01", validTo: "2026-12-31" })
    expect(isRateCardValidOn(bounded, "2026-01-01")).toBe(true)
    expect(isRateCardValidOn(bounded, "2026-12-31")).toBe(true)
  })

  it("excludes dates outside the window", () => {
    const bounded = card({ validFrom: "2026-01-01", validTo: "2026-12-31" })
    expect(isRateCardValidOn(bounded, "2025-12-31")).toBe(false)
    expect(isRateCardValidOn(bounded, "2027-01-01")).toBe(false)
  })
})

describe("findRateCardCandidates", () => {
  it("filters by route, suite type and date", () => {
    const cards = [
      card({ validTo: "2032-12-01" }),
      card({ routeId: "route-durban" }),
      card({ suiteTypeId: "suite-pullman" }),
      card({ validFrom: "2027-01-01" }),
    ]
    const found = findRateCardCandidates(cards, ROUTE, SUITE, "2026-11-20")
    expect(found).toEqual([cards[0]])
  })

  it("returns every rate type matching the same route, suite and date", () => {
    const cards = [card({ rateTypeId: RAC }), card({ rateTypeId: STO })]
    expect(findRateCardCandidates(cards, ROUTE, SUITE, "2026-11-20")).toHaveLength(2)
  })

  it("returns nothing when the suite type has no card on the route", () => {
    const cards = [card({ suiteTypeId: "suite-pullman" })]
    expect(findRateCardCandidates(cards, ROUTE, SUITE, "2026-11-20")).toEqual([])
  })
})

describe("hasAnyRateCardFor", () => {
  it("is true when only an expired card exists — the combination was priced once", () => {
    const cards = [card({ validFrom: "2020-01-01", validTo: "2021-12-31" })]
    expect(hasAnyRateCardFor(cards, ROUTE, SUITE)).toBe(true)
  })

  it("is false when the suite type was never priced on the route", () => {
    const cards = [card({ suiteTypeId: "suite-pullman" })]
    expect(hasAnyRateCardFor(cards, ROUTE, SUITE)).toBe(false)
  })
})

describe("selectRateCard", () => {
  const rac = card({ rateTypeId: RAC })
  const sto = card({ rateTypeId: STO })

  it("returns undefined with no candidates", () => {
    expect(selectRateCard([])).toBeUndefined()
  })

  it("prefers the per-leg override over the quote-level choice", () => {
    expect(selectRateCard([rac, sto], STO, RAC, RAC)).toBe(sto)
  })

  it("falls back to the quote-level choice when there is no override", () => {
    expect(selectRateCard([rac, sto], null, STO, RAC)).toBe(sto)
  })

  it("falls back to the system default when neither is available", () => {
    expect(selectRateCard([rac, sto], "rate-type-missing", null, STO)).toBe(sto)
  })

  it("falls back to the first candidate when no preference matches", () => {
    expect(selectRateCard([rac, sto], "rate-type-missing", null, "rate-type-also-missing")).toBe(rac)
  })
})
