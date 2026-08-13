import { describe, expect, it } from "vitest"

import {
  findRateCardCandidates,
  hasAnyRateCardFor,
  hasAnyRateCardForRateType,
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

  it("matches a route-agnostic card on any route — a tour type is priced once", () => {
    const cards = [card({ routeId: null })]
    expect(findRateCardCandidates(cards, ROUTE, SUITE, "2026-11-20")).toEqual(cards)
    expect(findRateCardCandidates(cards, "route-anything-else", SUITE, "2026-11-20")).toEqual(cards)
  })

  it("still honours the suite type and dates on a route-agnostic card", () => {
    const cards = [
      card({ routeId: null, suiteTypeId: "suite-pullman" }),
      card({ routeId: null, validFrom: "2027-01-01" }),
    ]
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

  it("counts a route-agnostic card as pricing every route", () => {
    const cards = [card({ routeId: null })]
    expect(hasAnyRateCardFor(cards, "route-anything-else", SUITE)).toBe(true)
  })
})

describe("hasAnyRateCardForRateType", () => {
  it("is true when only an expired card of that rate type exists", () => {
    const cards = [card({ rateTypeId: STO, validFrom: "2020-01-01", validTo: "2021-12-31" })]
    expect(hasAnyRateCardForRateType(cards, ROUTE, SUITE, STO)).toBe(true)
  })

  it("is false when the route+suite is priced, but never under that rate type", () => {
    const cards = [card({ rateTypeId: RAC })]
    expect(hasAnyRateCardForRateType(cards, ROUTE, SUITE, STO)).toBe(false)
  })

  it("reads a route-agnostic card as covering the asked-for route", () => {
    const cards = [card({ routeId: null, rateTypeId: STO })]
    expect(hasAnyRateCardForRateType(cards, ROUTE, SUITE, STO)).toBe(true)
    expect(hasAnyRateCardForRateType(cards, ROUTE, SUITE, RAC)).toBe(false)
  })
})

describe("selectRateCard", () => {
  const rac = card({ rateTypeId: RAC })
  const sto = card({ rateTypeId: STO })

  it("returns undefined with no candidates", () => {
    expect(selectRateCard([])).toBeUndefined()
  })

  it("prefers the per-leg override over the supplier's quoted rate", () => {
    expect(selectRateCard([rac, sto], STO, RAC, RAC)).toEqual({ ok: true, card: sto, inherited: false })
  })

  it("falls back to the supplier's quoted rate when there is no override", () => {
    expect(selectRateCard([rac, sto], null, STO, RAC)).toEqual({ ok: true, card: sto, inherited: true })
  })

  describe("an explicitly chosen rate type is a contract", () => {
    it("refuses to substitute another rate type's card", () => {
      expect(selectRateCard([rac, sto], "rate-type-missing", null, STO)).toEqual({
        ok: false,
        requestedRateTypeId: "rate-type-missing",
      })
    })

    it("does not fall through to the supplier's base rate or the system default either", () => {
      expect(selectRateCard([rac, sto], "rate-type-missing", RAC, STO, RAC)).toEqual({
        ok: false,
        requestedRateTypeId: "rate-type-missing",
      })
    })

    // The reported bug: a chosen rate whose card is out of date range used to quote at whatever
    // card happened to be first, so the price silently came from a different rate type.
    it("never returns the first candidate as a consolation prize", () => {
      const result = selectRateCard([rac, sto], "rate-type-missing", null, "rate-type-also-missing")
      expect(result).toEqual({ ok: false, requestedRateTypeId: "rate-type-missing" })
    })
  })

  describe("when nothing is explicitly chosen", () => {
    it("reports the most specific tier that missed", () => {
      expect(selectRateCard([rac], null, "quote-missing", "base-missing", "system-missing")).toEqual({
        ok: false,
        requestedRateTypeId: "quote-missing",
      })
    })

    it("takes any card when no rate type is knowable at all", () => {
      expect(selectRateCard([rac, sto], null, null, null, null)).toEqual({
        ok: true,
        card: rac,
        inherited: true,
      })
    })
  })

  describe("supplier tiers", () => {
    const NETT = "rate-type-nett"
    const nett = card({ rateTypeId: NETT })

    it("prices at the quoted rate ahead of the base rate", () => {
      expect(selectRateCard([rac, sto, nett], null, NETT, RAC, STO)).toEqual({
        ok: true,
        card: nett,
        inherited: true,
      })
    })

    // The reason this whole split exists: an inherited quoted rate was never asked for, so a
    // missing card means "fall back", not "fail" -- unlike an explicit per-leg choice.
    it("falls through to the base rate when the quoted rate has no card here", () => {
      expect(selectRateCard([rac, sto], null, NETT, RAC, STO)).toEqual({
        ok: true,
        card: rac,
        inherited: true,
      })
    })

    it("falls through to the system default when neither supplier tier has a card", () => {
      expect(selectRateCard([sto], null, NETT, RAC, STO)).toEqual({
        ok: true,
        card: sto,
        inherited: true,
      })
    })

    it("uses the base rate when no quoted rate is nominated", () => {
      expect(selectRateCard([rac, sto], null, null, RAC, STO)).toEqual({
        ok: true,
        card: rac,
        inherited: true,
      })
    })

    it("skips a null base rate, leaving the system default", () => {
      expect(selectRateCard([rac, sto], null, null, null, STO)).toEqual({
        ok: true,
        card: sto,
        inherited: true,
      })
    })
  })
})
