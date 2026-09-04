import { describe, expect, it } from "vitest"
import type { PackageLeg, SupplierKind } from "@/lib/types"
import { findTransferAnchorLeg, resolveTransferPickupDate } from "@/lib/packages/transfer-dates"

function leg(id: string, supplierKind: SupplierKind, sortOrder: number): PackageLeg {
  return {
    id,
    packageId: "pkg",
    supplierId: `supplier-${id}`,
    supplierName: id,
    supplierDescription: null,
    supplierKind,
    pricingMode: "rate_card",
    transferPricingBasis: "per_vehicle",
    accommodationPricingBasis: "per_person",
    baseRateTypeId: null,
    quoteRateTypeId: null,
    inheritedRateTypeName: null,
    applicableRateTypeIds: null,
    label: null,
    sortOrder,
    dateAnchor: null,
    routes: [],
    rateCards: [],
    suiteTypes: [],
  }
}

describe("resolveTransferPickupDate", () => {
  const dates = { start: "2026-09-10", end: "2026-09-12" }

  it("pre resolves to the anchor leg's start date", () => {
    expect(resolveTransferPickupDate("pre", dates)).toBe("2026-09-10")
  })

  it("post resolves to the anchor leg's end date", () => {
    expect(resolveTransferPickupDate("post", dates)).toBe("2026-09-12")
  })

  it("returns null for custom, unset, or missing anchor dates", () => {
    expect(resolveTransferPickupDate("custom", dates)).toBeNull()
    expect(resolveTransferPickupDate(null, dates)).toBeNull()
    expect(resolveTransferPickupDate("pre", null)).toBeNull()
  })
})

describe("findTransferAnchorLeg", () => {
  const train = leg("train", "train_operator", 1)
  const transfer1 = leg("transfer-1", "transfers", 2)
  const hotel = leg("hotel", "hotel_property", 3)
  const transfer2 = leg("transfer-2", "transfers", 4)
  const legs = [transfer2, hotel, transfer1, train]

  it("anchors a transfer to the dated leg directly above it", () => {
    expect(findTransferAnchorLeg(legs, "transfer-1")?.id).toBe("train")
    expect(findTransferAnchorLeg(legs, "transfer-2")?.id).toBe("hotel")
  })

  it("walks past a stacked transfer/rental to the nearest dated leg above", () => {
    const stacked = [leg("transfer-a", "transfers", 2), leg("rental-a", "vehicle_rental", 3), train]
    // train sorts first (order 1); transfer-a and rental-a stack above it in list order but below
    // it by sortOrder, so both anchor to the train.
    expect(findTransferAnchorLeg(stacked, "transfer-a")?.id).toBe("train")
    expect(findTransferAnchorLeg(stacked, "rental-a")?.id).toBe("train")
  })

  it("returns null for a transfer that opens the itinerary", () => {
    expect(findTransferAnchorLeg(legs, "train")).toBeNull()
  })

  it("returns null when only other transport legs precede it — no forward fallback", () => {
    const transportOnly = [leg("transfer-only", "transfers", 1), leg("rental-only", "vehicle_rental", 0)]
    expect(findTransferAnchorLeg(transportOnly, "transfer-only")).toBeNull()
  })

  it("returns null for an id not present in the leg list", () => {
    expect(findTransferAnchorLeg(legs, "missing")).toBeNull()
  })
})
