import { describe, expect, it } from "vitest"
import type { PricingSnapshot } from "@/lib/types"
import { describeInvoiceLine } from "./describe-invoice-line"

function makeSnapshot(overrides: Partial<PricingSnapshot> = {}): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "package-1",
    packageName: "Cape Town Journey",
    legId: "leg-1",
    legLabel: "Rovos Rail",
    supplierId: "supplier-1",
    supplierName: "Rovos Rail",
    supplierKind: "train_operator",
    routeId: "route-1",
    routeName: "Pretoria to Cape Town",
    suiteTypeId: "suite-1",
    suiteTypeName: "Deluxe Suite",
    rateCardId: "rate-1",
    travelDate: "2026-07-20",
    passengerKind: "adult",
    baseUnitPrice: 16903.75,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...overrides,
  }
}

describe("describeInvoiceLine", () => {
  it("renders Supplier — Route for a train line", () => {
    expect(describeInvoiceLine("Rovos Rail - Deluxe Suite - Pretoria to Cape Town - Adult", makeSnapshot())).toBe(
      "Rovos Rail — Pretoria to Cape Town",
    )
  })

  it("renders Supplier — meal plan for a hotel line (route field carries the meal plan)", () => {
    const snapshot = makeSnapshot({
      supplierName: "Irene Country Lodge",
      legLabel: "Irene Country Lodge",
      routeName: "Full Board",
      passengerKind: "included",
    })
    expect(describeInvoiceLine("Irene Country Lodge - Full Board - 2 nights", snapshot)).toBe(
      "Irene Country Lodge — Full Board",
    )
  })

  it("appends (Child) for child passenger lines", () => {
    const snapshot = makeSnapshot({ passengerKind: "child" })
    expect(describeInvoiceLine("Rovos Rail - Deluxe Suite - Child", snapshot)).toBe(
      "Rovos Rail — Pretoria to Cape Town (Child)",
    )
  })

  it("appends (Infant) for infant passenger lines", () => {
    const snapshot = makeSnapshot({ passengerKind: "infant" })
    expect(describeInvoiceLine("Rovos Rail - Deluxe Suite - Infant", snapshot)).toBe(
      "Rovos Rail — Pretoria to Cape Town (Infant)",
    )
  })

  it("keeps the one-way route arrow (invoice PDF now embeds Montserrat, which has the glyph)", () => {
    const snapshot = makeSnapshot({ routeName: "Pretoria → Cape Town" })
    expect(describeInvoiceLine("Rovos Rail - Deluxe Suite - Pretoria → Cape Town - Adult", snapshot)).toBe(
      "Rovos Rail — Pretoria → Cape Town",
    )
  })

  it("keeps the round-trip route arrow", () => {
    const snapshot = makeSnapshot({ routeName: "Pretoria ↔ Cape Town" })
    expect(describeInvoiceLine("Rovos Rail - Deluxe Suite - Pretoria ↔ Cape Town - Adult", snapshot)).toBe(
      "Rovos Rail — Pretoria ↔ Cape Town",
    )
  })

  it("falls back to supplier only when there is no route", () => {
    const snapshot = makeSnapshot({ routeName: null })
    expect(describeInvoiceLine("Rovos Rail - Deluxe Suite", snapshot)).toBe("Rovos Rail")
  })

  it("falls back to legLabel when supplierName is missing", () => {
    const snapshot = makeSnapshot({ supplierName: null, legLabel: "Transfer Leg", routeName: "Airport to Hotel" })
    expect(describeInvoiceLine("Transfer - Airport to Hotel", snapshot)).toBe("Transfer Leg — Airport to Hotel")
  })

  it("returns the stored description unchanged when there is no snapshot", () => {
    expect(describeInvoiceLine("Manual extra line", null)).toBe("Manual extra line")
  })

  it("returns the stored description unchanged when the snapshot has no supplier or leg label", () => {
    const snapshot = makeSnapshot({ supplierName: null, legLabel: null })
    expect(describeInvoiceLine("Package Total", snapshot)).toBe("Package Total")
  })

  it("labels a transfer line with the category word plus route, never the supplier", () => {
    const snapshot = makeSnapshot({
      supplierName: "Ulysses Tours & Transfers",
      legLabel: "Ulysses Tours & Transfers",
      routeName: "Cape Town Station to The President Hotel",
      serviceType: "transfer",
    })
    expect(describeInvoiceLine("Ulysses Tours & Transfers - Transfer", snapshot)).toBe(
      "Transfer Cape Town Station to The President Hotel",
    )
  })

  it("labels a car-rental line with the category word plus route, never the supplier", () => {
    const snapshot = makeSnapshot({
      supplierName: "Avis",
      legLabel: "Avis",
      routeName: "Cape Town Airport",
      serviceType: "rental",
    })
    expect(describeInvoiceLine("Avis - Vehicle Rental", snapshot)).toBe("Rental Cape Town Airport")
  })

  it("uses the category word alone for a transfer line with no route", () => {
    const snapshot = makeSnapshot({
      supplierName: "Ulysses Tours & Transfers",
      legLabel: null,
      routeName: null,
      serviceType: "transfer",
    })
    expect(describeInvoiceLine("Transfer", snapshot)).toBe("Transfer")
  })

  it("still appends (Child)/(Infant) on a generic transfer line", () => {
    const snapshot = makeSnapshot({
      supplierName: "Ulysses Tours & Transfers",
      routeName: "Cape Town Station to The President Hotel",
      serviceType: "transfer",
      passengerKind: "child",
    })
    expect(describeInvoiceLine("Ulysses Tours & Transfers - Transfer - Child", snapshot)).toBe(
      "Transfer Cape Town Station to The President Hotel (Child)",
    )
  })
})
