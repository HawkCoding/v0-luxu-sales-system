import { describe, expect, it } from "vitest"
import type { RateType, SupplierRateCard } from "@/lib/types"
import {
  UNRESOLVED_RATE_TYPE_ID,
  rateCardMatchesPill,
  resolveRateTypePills,
} from "@/lib/rate-types/view-rate-type-pills"

function makeRateType(overrides: Partial<RateType> & { id: string }): RateType {
  return {
    code: overrides.id.toUpperCase(),
    name: overrides.id,
    sortOrder: 0,
    isDefault: false,
    isStandard: false,
    audience: null,
    clientLabel: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeRateCard(overrides: Partial<SupplierRateCard> & { rateTypeId: string }): SupplierRateCard {
  return {
    id: `rc-${Math.random().toString(36).slice(2)}`,
    routeId: "route-1",
    suiteTypeId: "suite-1",
    pricePerPerson: 100,
    childPrice: null,
    infantPrice: null,
    currency: "GBP",
    validFrom: "2026-01-01",
    validTo: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

describe("resolveRateTypePills", () => {
  it("produces one pill per rate type that has cards, ordered by sortOrder", () => {
    const rateTypes = [
      makeRateType({ id: "trade", name: "Trade", sortOrder: 2 }),
      makeRateType({ id: "standard", name: "Standard", sortOrder: 0, isDefault: true }),
      makeRateType({ id: "net", name: "Net", sortOrder: 1 }),
    ]
    const cards = [
      makeRateCard({ rateTypeId: "net" }),
      makeRateCard({ rateTypeId: "standard" }),
      makeRateCard({ rateTypeId: "trade" }),
    ]

    const { pills, defaultSelectedId } = resolveRateTypePills(cards, rateTypes, "standard")

    expect(pills.map((p) => p.id)).toEqual(["standard", "net", "trade"])
    expect(defaultSelectedId).toBe("standard")
  })

  it("omits rate types that have no cards", () => {
    const rateTypes = [
      makeRateType({ id: "standard", name: "Standard", sortOrder: 0, isDefault: true }),
      makeRateType({ id: "net", name: "Net", sortOrder: 1 }),
    ]
    const cards = [makeRateCard({ rateTypeId: "standard" })]

    const { pills } = resolveRateTypePills(cards, rateTypes, "standard")

    expect(pills.map((p) => p.id)).toEqual(["standard"])
  })

  it("returns a single pill when only one rate type has cards", () => {
    const rateTypes = [makeRateType({ id: "standard", name: "Standard", isDefault: true })]
    const cards = [makeRateCard({ rateTypeId: "standard" })]

    const { pills, defaultSelectedId } = resolveRateTypePills(cards, rateTypes, "standard")

    expect(pills).toHaveLength(1)
    expect(defaultSelectedId).toBe("standard")
  })

  it("keeps archived rate types that still have cards", () => {
    const rateTypes = [
      makeRateType({ id: "standard", name: "Standard", sortOrder: 0, isDefault: true }),
      makeRateType({
        id: "legacy",
        name: "Legacy",
        sortOrder: 1,
        archivedAt: "2026-02-01T00:00:00Z",
      }),
    ]
    const cards = [
      makeRateCard({ rateTypeId: "standard" }),
      makeRateCard({ rateTypeId: "legacy" }),
    ]

    const { pills } = resolveRateTypePills(cards, rateTypes, "standard")

    expect(pills.map((p) => p.id)).toEqual(["standard", "legacy"])
  })

  it("groups cards with an unknown rate type under an 'Other' pill placed last", () => {
    const rateTypes = [makeRateType({ id: "standard", name: "Standard", isDefault: true })]
    const cards = [
      makeRateCard({ rateTypeId: "standard" }),
      makeRateCard({ rateTypeId: "deleted-rate-type" }),
    ]

    const { pills } = resolveRateTypePills(cards, rateTypes, "standard")

    expect(pills.map((p) => p.id)).toEqual(["standard", UNRESOLVED_RATE_TYPE_ID])
    expect(pills.at(-1)?.name).toBe("Other")
  })

  it("falls back to the first pill when the default rate type has no cards", () => {
    const rateTypes = [
      makeRateType({ id: "standard", name: "Standard", sortOrder: 0, isDefault: true }),
      makeRateType({ id: "net", name: "Net", sortOrder: 1 }),
    ]
    const cards = [makeRateCard({ rateTypeId: "net" })]

    const { defaultSelectedId } = resolveRateTypePills(cards, rateTypes, "standard")

    expect(defaultSelectedId).toBe("net")
  })

  it("returns no pills and a null default when there are no cards", () => {
    const rateTypes = [makeRateType({ id: "standard", name: "Standard", isDefault: true })]

    const { pills, defaultSelectedId } = resolveRateTypePills([], rateTypes, "standard")

    expect(pills).toEqual([])
    expect(defaultSelectedId).toBeNull()
  })
})

describe("rateCardMatchesPill", () => {
  const rateTypes = [makeRateType({ id: "standard", name: "Standard" })]

  it("matches a card to its own rate type pill", () => {
    expect(
      rateCardMatchesPill(makeRateCard({ rateTypeId: "standard" }), "standard", rateTypes),
    ).toBe(true)
  })

  it("does not match a card to a different rate type pill", () => {
    expect(
      rateCardMatchesPill(makeRateCard({ rateTypeId: "standard" }), "net", rateTypes),
    ).toBe(false)
  })

  it("matches an unknown-rate-type card to the unresolved pill", () => {
    expect(
      rateCardMatchesPill(
        makeRateCard({ rateTypeId: "deleted" }),
        UNRESOLVED_RATE_TYPE_ID,
        rateTypes,
      ),
    ).toBe(true)
  })

  it("does not match a known card to the unresolved pill", () => {
    expect(
      rateCardMatchesPill(
        makeRateCard({ rateTypeId: "standard" }),
        UNRESOLVED_RATE_TYPE_ID,
        rateTypes,
      ),
    ).toBe(false)
  })
})
