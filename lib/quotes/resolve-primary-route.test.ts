import { describe, expect, it } from "vitest"
import { resolvePrimaryRoute } from "@/lib/quotes/resolve-primary-route"
import type { PricingSnapshot } from "@/lib/types"

function snapshot(overrides: Partial<PricingSnapshot>): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Test Package",
    legId: "leg-1",
    legLabel: "Leg",
    supplierId: "sup-1",
    supplierName: "Supplier",
    supplierKind: "train_operator",
    routeId: "route-1",
    routeName: "Pretoria ↔ Cape Town",
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "2026-09-20",
    passengerKind: "adult",
    baseUnitPrice: 100,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...overrides,
  }
}

describe("resolvePrimaryRoute", () => {
  it("prefers the train leg's route over other legs", () => {
    const result = resolvePrimaryRoute([
      {
        pricingSnapshot: snapshot({
          supplierKind: "transfers",
          routeId: "route-transfer",
          routeName: "Airport ↔ V&A Waterfront",
        }),
      },
      { pricingSnapshot: snapshot({ supplierKind: "train_operator", routeId: "route-train", routeName: "Pretoria ↔ Cape Town" }) },
    ])

    expect(result).toEqual({ routeId: "route-train", routeName: "Pretoria ↔ Cape Town" })
  })

  it("falls back to the first snapshot with a route when no train leg exists", () => {
    const result = resolvePrimaryRoute([
      { pricingSnapshot: null },
      {
        pricingSnapshot: snapshot({
          supplierKind: "transfers",
          routeId: "route-transfer",
          routeName: "Airport ↔ Hotel",
        }),
      },
    ])

    expect(result).toEqual({ routeId: "route-transfer", routeName: "Airport ↔ Hotel" })
  })

  it("ignores snapshots without a routeId", () => {
    const result = resolvePrimaryRoute([
      { pricingSnapshot: snapshot({ supplierKind: "hotel_property", routeId: null, routeName: null }) },
    ])

    expect(result).toEqual({ routeId: null, routeName: null })
  })

  it("returns nulls for manual line items without snapshots", () => {
    expect(resolvePrimaryRoute([{ pricingSnapshot: null }, {}])).toEqual({
      routeId: null,
      routeName: null,
    })
  })

  it("excludes hotel legs — their route is a meal plan, not a journey", () => {
    const result = resolvePrimaryRoute([
      {
        pricingSnapshot: snapshot({
          supplierKind: "hotel_property",
          routeId: "meal-plan-1",
          routeName: "Bed & Breakfast",
        }),
      },
      {
        pricingSnapshot: snapshot({
          supplierKind: "transfers",
          routeId: "route-transfer",
          routeName: "Airport ↔ Hotel",
        }),
      },
    ])

    expect(result).toEqual({ routeId: "route-transfer", routeName: "Airport ↔ Hotel" })
  })

  it("returns nulls when the only routed leg is a hotel", () => {
    expect(
      resolvePrimaryRoute([
        {
          pricingSnapshot: snapshot({
            supplierKind: "hotel_property",
            routeId: "meal-plan-1",
            routeName: "Half Board",
          }),
        },
      ]),
    ).toEqual({ routeId: null, routeName: null })
  })
})
