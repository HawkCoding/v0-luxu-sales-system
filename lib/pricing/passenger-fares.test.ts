import { describe, expect, it } from "vitest"
import { manualFares, overriddenFares, rateCardFares } from "./passenger-fares"

describe("rateCardFares", () => {
  it("uses each column's own price when all three are set", () => {
    const fares = rateCardFares({ pricePerPerson: 400, childPrice: 200, infantPrice: 50 })
    expect(fares).toEqual([
      { key: "adultCount", label: "Adult", kind: "adult", unitPrice: 400 },
      { key: "childCount", label: "Child", kind: "child", unitPrice: 200 },
      { key: "infantCount", label: "Infant", kind: "infant", unitPrice: 50 },
    ])
  })

  it("falls a missing child price back to the adult price", () => {
    const fares = rateCardFares({ pricePerPerson: 400, childPrice: null, infantPrice: 50 })
    expect(fares.find((f) => f.key === "childCount")?.unitPrice).toBe(400)
  })

  it("falls a missing infant price back to ZERO, never to the child price", () => {
    const fares = rateCardFares({ pricePerPerson: 400, childPrice: 200, infantPrice: null })
    expect(fares.find((f) => f.key === "infantCount")?.unitPrice).toBe(0)
  })

  it("a card with only an adult price prices child and infant at adult / zero respectively", () => {
    const fares = rateCardFares({ pricePerPerson: 400, childPrice: null, infantPrice: null })
    expect(fares).toEqual([
      { key: "adultCount", label: "Adult", kind: "adult", unitPrice: 400 },
      { key: "childCount", label: "Child", kind: "child", unitPrice: 400 },
      { key: "infantCount", label: "Infant", kind: "infant", unitPrice: 0 },
    ])
  })
})

describe("manualFares", () => {
  it("uses each typed price when all three are set", () => {
    const fares = manualFares({ adult: 400, child: 200, infant: 50 })
    expect(fares.map((f) => f.unitPrice)).toEqual([400, 200, 50])
  })

  it("falls a missing child price back to the adult price", () => {
    const fares = manualFares({ adult: 400, child: null, infant: 50 })
    expect(fares.find((f) => f.key === "childCount")?.unitPrice).toBe(400)
  })

  it("falls a missing infant price back to the CHILD price, unlike rateCardFares", () => {
    const fares = manualFares({ adult: 400, child: 200, infant: null })
    expect(fares.find((f) => f.key === "infantCount")?.unitPrice).toBe(200)
  })

  it("with nothing typed, everything falls through to zero", () => {
    const fares = manualFares({ adult: null, child: null, infant: null })
    expect(fares.map((f) => f.unitPrice)).toEqual([0, 0, 0])
  })
})

describe("overriddenFares", () => {
  const card = { pricePerPerson: 400, childPrice: 200, infantPrice: 50 }

  it("uses the typed override for each kind when set", () => {
    const fares = overriddenFares(card, { adult: 500, child: 250, infant: 60 })
    expect(fares.map((f) => f.unitPrice)).toEqual([500, 250, 60])
  })

  it("falls back to the rate card for kinds with no override", () => {
    const fares = overriddenFares(card, { adult: null, child: null, infant: null })
    expect(fares.map((f) => f.unitPrice)).toEqual([400, 200, 50])
  })

  it("child falls back through the overridden adult price, not the card's adult price", () => {
    const fares = overriddenFares(card, { adult: 500, child: null, infant: null })
    // card.childPrice is set (200), so it still wins over the overridden adult -- only a
    // missing card child price would fall through to the resolved adult.
    expect(fares.find((f) => f.key === "childCount")?.unitPrice).toBe(200)
    const cardNoChild = { pricePerPerson: 400, childPrice: null, infantPrice: 50 }
    const faresNoChildCard = overriddenFares(cardNoChild, { adult: 500, child: null, infant: null })
    expect(faresNoChildCard.find((f) => f.key === "childCount")?.unitPrice).toBe(500)
  })

  it("works with no rate card at all -- an override needs no card", () => {
    const fares = overriddenFares(null, { adult: 500, child: 250, infant: 60 })
    expect(fares.map((f) => f.unitPrice)).toEqual([500, 250, 60])
  })

  it("with no card and no infant override, infant is zero, never the child price", () => {
    const fares = overriddenFares(null, { adult: 500, child: 250, infant: null })
    expect(fares.find((f) => f.key === "infantCount")?.unitPrice).toBe(0)
  })
})
