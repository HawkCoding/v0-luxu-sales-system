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

describe("hasAnyRateCardForRateType", () => {
  it("is true when only an expired card of that rate type exists", () => {
    const cards = [card({ rateTypeId: STO, validFrom: "2020-01-01", validTo: "2021-12-31" })]
    expect(hasAnyRateCardForRateType(cards, ROUTE, SUITE, STO)).toBe(true)
  })

  it("is false when the route+suite is priced, but never under that rate type", () => {
    const cards = [card({ rateTypeId: RAC })]
    expect(hasAnyRateCardForRateType(cards, ROUTE, SUITE, STO)).toBe(false)
  })
})

describe("selectRateCard", () => {
  const rac = card({ rateTypeId: RAC })
  const sto = card({ rateTypeId: STO })

  it("returns undefined with no candidates", () => {
    expect(selectRateCard([])).toBeUndefined()
  })

  it("prefers the per-leg override over the quote-level choice", () => {
    expect(selectRateCard([rac, sto], STO, RAC, RAC)).toEqual({ ok: true, card: sto, inherited: false })
  })

  it("falls back to the quote-level choice when there is no override", () => {
    expect(selectRateCard([rac, sto], null, STO, RAC)).toEqual({ ok: true, card: sto, inherited: true })
  })

  it("falls back to the system default when the quote-level choice has no card", () => {
    expect(selectRateCard([rac, sto], null, "rate-type-missing", STO)).toEqual({
      ok: true,
      card: sto,
      inherited: true,
    })
  })

  describe("an explicitly chosen rate type is a contract", () => {
    it("refuses to substitute another rate type's card", () => {
      expect(selectRateCard([rac, sto], "rate-type-missing", null, STO)).toEqual({
        ok: false,
        requestedRateTypeId: "rate-type-missing",
      })
    })

    it("does not fall through to the supplier or system default either", () => {
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
    it("reports the most specific default that missed", () => {
      expect(selectRateCard([rac], null, "quote-missing", "system-missing", "supplier-missing")).toEqual({
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

  describe("supplier default tier", () => {
    const NETT = "rate-type-nett"
    const nett = card({ rateTypeId: NETT })

    it("loses to the per-leg override and to the customer default", () => {
      expect(selectRateCard([rac, sto, nett], STO, null, RAC, NETT)).toEqual({
        ok: true,
        card: sto,
        inherited: false,
      })
      expect(selectRateCard([rac, sto, nett], null, STO, RAC, NETT)).toEqual({
        ok: true,
        card: sto,
        inherited: true,
      })
    })

    it("wins over the system default when the customer has none", () => {
      expect(selectRateCard([rac, sto, nett], null, null, RAC, NETT)).toEqual({
        ok: true,
        card: nett,
        inherited: true,
      })
    })

    it("falls through to the system default when the supplier default has no card", () => {
      expect(selectRateCard([rac, sto], null, null, RAC, NETT)).toEqual({
        ok: true,
        card: rac,
        inherited: true,
      })
    })

    it("is skipped when null, leaving the previous precedence intact", () => {
      expect(selectRateCard([rac, sto], null, null, STO, null)).toEqual({
        ok: true,
        card: sto,
        inherited: true,
      })
    })
  })
})
