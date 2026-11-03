import { describe, expect, it, vi } from "vitest"
import { blockScopeTagger, lineScopeTag, resolvePaxGroupPricing } from "@/lib/quotes/resolve-pax-group-pricing"
import { CARMEN_SUBTOTAL, carmenQuoteLines, carmenServiceBlocks } from "@/lib/pax-groups/carmen-sample.fixtures"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"

function rateTypesClient(rows: Array<{ id: string; short_label: string | null }>) {
  const from = vi.fn(() => ({
    select: () => ({ in: async () => ({ data: rows, error: null }) }),
  }))
  return { from }
}

describe("resolvePaxGroupPricing", () => {
  it("prices each suite with the rate types' short labels", async () => {
    const supabase = rateTypesClient([
      { id: "rate-sa", short_label: "SA" },
      { id: "rate-tw", short_label: "TW" },
    ])
    const pricing = await resolvePaxGroupPricing(supabase as never, { lines: carmenQuoteLines(), target: CARMEN_SUBTOTAL })

    expect(pricing?.lines.map((line) => line.subtotal)).toEqual([47_600, 53_500, 37_800, 53_500, 32_400, 47_600])
    expect(pricing?.lines[1].parts.map((part) => part.rateLabel)).toEqual(["SA", "TW"])
    expect(supabase.from).toHaveBeenCalledWith("rate_types")
  })

  it("is null without pax groups, and reads nothing", async () => {
    const supabase = rateTypesClient([])
    const plain = [{ total: 1_000, pricing_snapshot: { legId: "leg", supplierKind: "transfers" } }]

    expect(await resolvePaxGroupPricing(supabase as never, { lines: plain, target: 1_000 })).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("never throws, printing untagged lines when the labels can't be read", async () => {
    const failing = {
      from() {
        throw new Error("no database")
      },
    }
    const pricing = await resolvePaxGroupPricing(failing as never, { lines: carmenQuoteLines(), target: CARMEN_SUBTOTAL })
    expect(pricing?.lines[1].parts.map((part) => part.rateLabel)).toEqual([null, null])
  })
})

describe("blockScopeTagger / lineScopeTag", () => {
  const lines = carmenQuoteLines()

  it("is undefined on a booking without groups, so nothing is tagged", () => {
    expect(blockScopeTagger([{ pricing_snapshot: { legId: "leg-1" } }])).toBeUndefined()
  })

  it("tags a transfer block by its own trip, not its leg", () => {
    const tag = blockScopeTagger(lines, "Suite")
    const [, minibus, hotel, suite6] = carmenServiceBlocks()

    expect(tag?.(suite6)).toBe("(Suite 6 only)")
    expect(tag?.(minibus)).toBeNull()
    expect(tag?.(hotel)).toBeNull()
  })

  it("falls back to the leg when the lines carry no trip id", () => {
    const withoutTrips = lines.map((line) => {
      const snapshot = line.pricing_snapshot as Record<string, unknown>
      const { transportRequestId: _dropped, ...rest } = snapshot
      return { ...line, pricing_snapshot: snapshot.paxGroupIds ? { ...rest, legId: "leg-suite6-only" } : rest }
    })
    const block = { legId: "leg-suite6-only", transportRequestId: "tr-suite6" } as VoucherServiceBlock

    expect(blockScopeTagger(withoutTrips)?.(block)).toBe("(Suite 6 only)")
  })

  it("tags one priced line by its trip, else its leg", () => {
    expect(lineScopeTag(lines, { legId: "leg-transfer", transportRequestId: "tr-suite6" }, "Room")).toBe("(Room 6 only)")
    expect(lineScopeTag(lines, { legId: "leg-train" })).toBeNull()
    expect(lineScopeTag(lines, null)).toBeNull()
  })
})
