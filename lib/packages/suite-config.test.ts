import { describe, expect, it, vi } from "vitest"
import { findInvalidVariantField, loadAllowedSuiteVariantIds } from "./suite-config"

const SUITE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const SUITE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const BEDROOM_TWIN = "11111111-1111-4111-8111-111111111111"
const BEDROOM_QUEEN = "22222222-2222-4222-8222-222222222222"
const LAYOUT_A = "33333333-3333-4333-8333-333333333333"
const BATHROOM_A = "44444444-4444-4444-8444-444444444444"

function buildSupabase(options: {
  bedroomTypes?: Array<{ suite_type_id: string; bedroom_type_id: string }>
  bedroomLayouts?: Array<{ suite_type_id: string; bedroom_layout_id: string }>
  bathroomTypes?: Array<{ suite_type_id: string; bathroom_type_id: string }>
}) {
  const bedroomTypesIn = vi.fn(async () => ({ data: options.bedroomTypes ?? [], error: null }))
  const bedroomLayoutsIn = vi.fn(async () => ({ data: options.bedroomLayouts ?? [], error: null }))
  const bathroomTypesIn = vi.fn(async () => ({ data: options.bathroomTypes ?? [], error: null }))

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "suite_type_bedroom_types") {
        return { select: vi.fn(() => ({ in: bedroomTypesIn })) }
      }
      if (table === "suite_type_bedroom_layouts") {
        return { select: vi.fn(() => ({ in: bedroomLayoutsIn })) }
      }
      if (table === "suite_type_bathroom_types") {
        return { select: vi.fn(() => ({ in: bathroomTypesIn })) }
      }
      throw new Error(`Unexpected table ${table}`)
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return { supabase, bedroomTypesIn, bedroomLayoutsIn, bathroomTypesIn }
}

describe("loadAllowedSuiteVariantIds", () => {
  it("returns an empty map without querying when no suite type ids are given", async () => {
    const { supabase } = buildSupabase({})
    const result = await loadAllowedSuiteVariantIds(supabase, [])
    expect(result.size).toBe(0)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it("groups allowed variant ids per suite type across all three dimensions", async () => {
    const { supabase } = buildSupabase({
      bedroomTypes: [
        { suite_type_id: SUITE_A, bedroom_type_id: BEDROOM_TWIN },
        { suite_type_id: SUITE_A, bedroom_type_id: BEDROOM_QUEEN },
      ],
      bedroomLayouts: [{ suite_type_id: SUITE_A, bedroom_layout_id: LAYOUT_A }],
      bathroomTypes: [{ suite_type_id: SUITE_B, bathroom_type_id: BATHROOM_A }],
    })

    const result = await loadAllowedSuiteVariantIds(supabase, [SUITE_A, SUITE_B])

    expect(result.get(SUITE_A)?.bedroomTypeIds).toEqual(new Set([BEDROOM_TWIN, BEDROOM_QUEEN]))
    expect(result.get(SUITE_A)?.bedroomLayoutIds).toEqual(new Set([LAYOUT_A]))
    expect(result.get(SUITE_A)?.bathroomTypeIds).toEqual(new Set())
    expect(result.get(SUITE_B)?.bathroomTypeIds).toEqual(new Set([BATHROOM_A]))
  })

  it("de-duplicates repeated suite type ids before querying", async () => {
    const { supabase, bedroomTypesIn } = buildSupabase({})
    await loadAllowedSuiteVariantIds(supabase, [SUITE_A, SUITE_A, SUITE_A])
    expect(bedroomTypesIn).toHaveBeenCalledWith("suite_type_id", [SUITE_A])
  })
})

describe("findInvalidVariantField", () => {
  const allowed = new Map([
    [
      SUITE_A,
      {
        bedroomTypeIds: new Set([BEDROOM_TWIN]),
        bedroomLayoutIds: new Set([LAYOUT_A]),
        bathroomTypeIds: new Set<string>(),
      },
    ],
  ])

  it("returns null when every chosen field is allowed for the suite type", () => {
    const result = findInvalidVariantField(
      { suiteTypeId: SUITE_A, bedroomTypeId: BEDROOM_TWIN, bedroomLayoutId: LAYOUT_A },
      allowed,
    )
    expect(result).toBeNull()
  })

  it("returns null when no optional fields are chosen", () => {
    const result = findInvalidVariantField({ suiteTypeId: SUITE_A }, allowed)
    expect(result).toBeNull()
  })

  it("flags a bedroomTypeId not associated with the suite type", () => {
    const result = findInvalidVariantField(
      { suiteTypeId: SUITE_A, bedroomTypeId: BEDROOM_QUEEN },
      allowed,
    )
    expect(result).toBe("bedroomTypeId")
  })

  it("flags a bathroomTypeId when the suite type has no bathroom vocab at all", () => {
    const result = findInvalidVariantField(
      { suiteTypeId: SUITE_A, bathroomTypeId: BATHROOM_A },
      allowed,
    )
    expect(result).toBe("bathroomTypeId")
  })

  it("flags any field for a suite type with no allowed-vocab entry", () => {
    const result = findInvalidVariantField({ suiteTypeId: SUITE_B, bedroomTypeId: BEDROOM_TWIN }, allowed)
    expect(result).toBe("bedroomTypeId")
  })
})
