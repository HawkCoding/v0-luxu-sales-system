import { describe, expect, it } from "vitest"
import { resolveDefaultRateTypeId } from "./default-rate-type"
import type { RateType, SupplierKindDefaultRateType } from "@/lib/types"

function rateType(id: string, overrides: Partial<RateType> = {}): RateType {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    sortOrder: 0,
    isDefault: false,
    isStandard: false,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

const rac = rateType("rac", { isDefault: true, isStandard: true })
const sto = rateType("sto", { isStandard: true })
const rateTypes = [rac, sto]

describe("resolveDefaultRateTypeId", () => {
  it("uses the per-kind mapping when present and active", () => {
    const kindDefaults: SupplierKindDefaultRateType[] = [
      { kind: "hotel_property", rateTypeId: "sto" },
    ]
    expect(resolveDefaultRateTypeId("hotel_property", kindDefaults, rateTypes)).toBe("sto")
  })

  it("falls back to the global default when the kind has no mapping", () => {
    expect(resolveDefaultRateTypeId("train_operator", [], rateTypes)).toBe("rac")
  })

  it("ignores a mapping that points at an archived rate type", () => {
    const kindDefaults: SupplierKindDefaultRateType[] = [
      { kind: "hotel_property", rateTypeId: "archived" },
    ]
    expect(resolveDefaultRateTypeId("hotel_property", kindDefaults, rateTypes)).toBe("rac")
  })

  it("falls back to the first active rate type when no default flag exists", () => {
    const noDefault = [rateType("nett"), rateType("resident")]
    expect(resolveDefaultRateTypeId("airline", [], noDefault)).toBe("nett")
  })

  it("returns null when there are no active rate types", () => {
    expect(resolveDefaultRateTypeId("airline", [], [])).toBeNull()
  })
})
