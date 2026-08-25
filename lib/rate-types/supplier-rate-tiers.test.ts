import { describe, expect, it } from "vitest"
import { resolveSupplierRateTiers } from "./supplier-rate-tiers"
import type { RateType } from "@/lib/types"

function rateType(id: string, overrides: Partial<RateType> = {}): RateType {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    sortOrder: 0,
    isDefault: false,
    isStandard: false,
    audience: null,
    clientLabel: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

const rac = rateType("rac", { isDefault: true, isStandard: true })
const sto = rateType("sto", { isStandard: true })
const sadc = rateType("sadc")
const rateTypes = [rac, sto, sadc]

describe("resolveSupplierRateTiers", () => {
  describe("base rate", () => {
    it("uses the supplier's own base rate", () => {
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "sto" }).baseRateTypeId).toBe("sto")
    })

    it("lets two suppliers of the same kind hold different baselines", () => {
      // The case the column exists for: two train operators, two house rates.
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "sto" }).baseRateTypeId).toBe("sto")
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "rac" }).baseRateTypeId).toBe("rac")
    })

    it("falls back to the global default when the supplier has none", () => {
      expect(resolveSupplierRateTiers(rateTypes, {}).baseRateTypeId).toBe("rac")
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: null }).baseRateTypeId).toBe("rac")
    })

    it("ignores a base rate pointing at an archived or unknown rate type", () => {
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "gone" }).baseRateTypeId).toBe("rac")
      const withArchived = [...rateTypes, rateType("old", { archivedAt: "2026-02-01T00:00:00.000Z" })]
      expect(resolveSupplierRateTiers(withArchived, { baseRateTypeId: "old" }).baseRateTypeId).toBe("rac")
    })

    it("falls back to the first active rate type when no default flag exists", () => {
      const noDefault = [rateType("nett"), rateType("resident")]
      expect(resolveSupplierRateTiers(noDefault, {}).baseRateTypeId).toBe("nett")
    })

    it("returns nulls when there are no active rate types", () => {
      expect(resolveSupplierRateTiers([], {})).toEqual({
        baseRateTypeId: null,
        quoteRateTypeId: null,
        inheritedRateTypeName: null,
        applicableRateTypeIds: null,
      })
    })
  })

  describe("applicableRateTypeIds", () => {
    it("lists the base rate plus the supplier's own markdowns", () => {
      expect(
        resolveSupplierRateTiers(rateTypes, {
          baseRateTypeId: "sto",
          adjustmentRateTypeIds: ["sadc"],
        }).applicableRateTypeIds,
      ).toEqual(["sto", "sadc"])
    })

    it("always includes the base rate, even with no markdowns captured", () => {
      expect(
        resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "sto", adjustmentRateTypeIds: [] })
          .applicableRateTypeIds,
      ).toEqual(["sto"])
    })

    it("never repeats the base rate when it also has a markdown row", () => {
      expect(
        resolveSupplierRateTiers(rateTypes, {
          baseRateTypeId: "sto",
          adjustmentRateTypeIds: ["sto", "sadc"],
        }).applicableRateTypeIds,
      ).toEqual(["sto", "sadc"])
    })

    it("drops markdowns pointing at an archived or unknown rate type", () => {
      const withArchived = [...rateTypes, rateType("old", { archivedAt: "2026-02-01T00:00:00.000Z" })]
      expect(
        resolveSupplierRateTiers(withArchived, {
          baseRateTypeId: "rac",
          adjustmentRateTypeIds: ["old", "gone", "sadc"],
        }).applicableRateTypeIds,
      ).toEqual(["rac", "sadc"])
    })

    it("stays null when the caller never loaded the markdowns", () => {
      // Null is "unknown", not "none" -- the picker must not hide valid rates on that basis.
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "sto" }).applicableRateTypeIds).toBeNull()
    })
  })

  describe("quoted rate", () => {
    it("keeps a nomination that differs from the base rate", () => {
      expect(
        resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "rac", quoteRateTypeId: "sadc" })
          .quoteRateTypeId,
      ).toBe("sadc")
    })

    it("normalises a nomination of the base rate to null", () => {
      // "Quote at the base rate" has one encoding, so callers only handle the differing case.
      expect(
        resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "sto", quoteRateTypeId: "sto" })
          .quoteRateTypeId,
      ).toBeNull()
    })

    it("drops a nomination pointing at an archived or unknown rate type", () => {
      expect(
        resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "rac", quoteRateTypeId: "gone" })
          .quoteRateTypeId,
      ).toBeNull()
      const withArchived = [...rateTypes, rateType("old", { archivedAt: "2026-02-01T00:00:00.000Z" })]
      expect(
        resolveSupplierRateTiers(withArchived, { baseRateTypeId: "rac", quoteRateTypeId: "old" })
          .quoteRateTypeId,
      ).toBeNull()
    })
  })

  describe("inheritedRateTypeName", () => {
    it("names the quoted rate when one is nominated", () => {
      expect(
        resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "rac", quoteRateTypeId: "sadc" })
          .inheritedRateTypeName,
      ).toBe("sadc")
    })

    it("names the base rate otherwise", () => {
      expect(resolveSupplierRateTiers(rateTypes, { baseRateTypeId: "sto" }).inheritedRateTypeName).toBe(
        "sto",
      )
      expect(resolveSupplierRateTiers(rateTypes, {}).inheritedRateTypeName).toBe("rac")
    })
  })
})
