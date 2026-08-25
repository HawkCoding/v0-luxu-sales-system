import { describe, expect, it } from "vitest"
import { resolveQuoteConfig, type QuoteConfigInput } from "./quote-config"
import type { PricingSnapshot } from "@/lib/types"

function snapshot(overrides: Partial<PricingSnapshot>): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Test Package",
    legId: "leg-1",
    legLabel: "Leg",
    supplierId: "sup-rovos",
    supplierName: "Rovos Rail",
    supplierKind: "train_operator",
    routeId: "route-1",
    routeName: "Pretoria ↔ Cape Town",
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    rateTypeId: "rate-rvsadc",
    travelDate: "2026-09-20",
    passengerKind: "adult",
    baseUnitPrice: 100,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...overrides,
  }
}

const NO_OVERRIDES = { journeyClass: null, rateAudience: null, showTrainOnlyNote: null }

function input(overrides: Partial<QuoteConfigInput>): QuoteConfigInput {
  return {
    lineItems: [],
    suppliers: {},
    routes: {},
    rateTypes: {},
    overrides: NO_OVERRIDES,
    ...overrides,
  }
}

describe("resolveQuoteConfig — journey class", () => {
  it("derives long when the route's duration meets the supplier's threshold", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({}) }],
        suppliers: { "sup-rovos": { longJourneyMinDays: 9 } },
        routes: { "route-1": { durationDays: 9 } },
      }),
    )
    expect(result.journeyClass).toBe("long")
    expect(result.auto.journeyClass).toBe(true)
    expect(result.unresolved).toEqual([])
  })

  it("derives short when the route's duration is below the threshold", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({}) }],
        suppliers: { "sup-rovos": { longJourneyMinDays: 9 } },
        routes: { "route-1": { durationDays: 4 } },
      }),
    )
    expect(result.journeyClass).toBe("short")
  })

  it("has no short/long concept when the supplier carries no threshold (Blue Train)", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({ supplierId: "sup-bt", supplierName: "The Blue Train" }) }],
        suppliers: { "sup-bt": { longJourneyMinDays: null } },
        routes: { "route-1": { durationDays: 3 } },
      }),
    )
    expect(result.journeyClass).toBeNull()
    expect(result.unresolved).toEqual([])
  })

  it("flags unresolved when the threshold exists but the route's duration is missing", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({}) }],
        suppliers: { "sup-rovos": { longJourneyMinDays: 9 } },
        routes: { "route-1": { durationDays: null, name: "Dar Es Salaam Journey" } },
      }),
    )
    expect(result.journeyClass).toBeNull()
    expect(result.unresolved).toEqual(["Journey length not recorded on Dar Es Salaam Journey."])
  })

  it("a saved override wins over the derived value", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({}) }],
        suppliers: { "sup-rovos": { longJourneyMinDays: 9 } },
        routes: { "route-1": { durationDays: 4 } },
        overrides: { ...NO_OVERRIDES, journeyClass: "long" },
      }),
    )
    expect(result.journeyClass).toBe("long")
    expect(result.auto.journeyClass).toBe(false)
  })
})

describe("resolveQuoteConfig — rate audience", () => {
  it("derives from the primary train leg's rate type", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({ rateTypeId: "rate-rvsadc" }) }],
        rateTypes: { "rate-rvsadc": { audience: "resident" } },
      }),
    )
    expect(result.rateAudience).toBe("resident")
    expect(result.auto.rateAudience).toBe(true)
  })

  it("defaults to international when the rate type carries no audience", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({ rateTypeId: "rate-rac" }) }],
        rateTypes: { "rate-rac": { audience: null } },
      }),
    )
    expect(result.rateAudience).toBe("international")
  })

  it("defaults to international when there is no rate type on the primary leg", () => {
    const result = resolveQuoteConfig(input({ lineItems: [{ pricingSnapshot: snapshot({ rateTypeId: null }) }] }))
    expect(result.rateAudience).toBe("international")
  })

  it("a saved override wins over the derived value", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({ rateTypeId: "rate-rvsadc" }) }],
        rateTypes: { "rate-rvsadc": { audience: "resident" } },
        overrides: { ...NO_OVERRIDES, rateAudience: "international" },
      }),
    )
    expect(result.rateAudience).toBe("international")
    expect(result.auto.rateAudience).toBe(false)
  })
})

describe("resolveQuoteConfig — train only", () => {
  it("is true when every priced leg is a train_operator leg", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [
          { pricingSnapshot: snapshot({ passengerKind: "adult" }) },
          { pricingSnapshot: snapshot({ passengerKind: "child" }) },
        ],
      }),
    )
    expect(result.trainOnly).toBe(true)
  })

  it("ignores the Commission line (passengerKind service, supplierKind null)", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [
          { pricingSnapshot: snapshot({}) },
          { pricingSnapshot: snapshot({ passengerKind: "service", supplierKind: null, supplierId: null }) },
        ],
      }),
    )
    expect(result.trainOnly).toBe(true)
  })

  it("is false when a hotel leg is also priced", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [
          { pricingSnapshot: snapshot({}) },
          { pricingSnapshot: snapshot({ supplierId: "sup-hotel", supplierKind: "hotel_property" }) },
        ],
      }),
    )
    expect(result.trainOnly).toBe(false)
  })

  it("is false when a transfer leg is also priced", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [
          { pricingSnapshot: snapshot({}) },
          { pricingSnapshot: snapshot({ supplierId: "sup-transfer", supplierKind: "transfers" }) },
        ],
      }),
    )
    expect(result.trainOnly).toBe(false)
  })

  it("is true across two train suppliers on the same quote", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [
          { pricingSnapshot: snapshot({ supplierId: "sup-rovos", supplierKind: "train_operator" }) },
          { pricingSnapshot: snapshot({ supplierId: "sup-bt", supplierName: "The Blue Train", supplierKind: "train_operator" }) },
        ],
      }),
    )
    expect(result.trainOnly).toBe(true)
  })

  it("a saved override wins over the derived value", () => {
    const result = resolveQuoteConfig(
      input({
        lineItems: [{ pricingSnapshot: snapshot({}) }],
        overrides: { ...NO_OVERRIDES, showTrainOnlyNote: false },
      }),
    )
    expect(result.trainOnly).toBe(false)
    expect(result.auto.trainOnly).toBe(false)
  })
})

describe("resolveQuoteConfig — primary ids", () => {
  it("exposes the primary supplier and route the other axes resolved against", () => {
    const result = resolveQuoteConfig(input({ lineItems: [{ pricingSnapshot: snapshot({}) }] }))
    expect(result.primarySupplierId).toBe("sup-rovos")
    expect(result.primaryRouteId).toBe("route-1")
  })
})
