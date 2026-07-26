import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import {
  loadSupplierSuiteVocabulary,
  suiteVocabularyFromSupplierDetail,
} from "@/lib/suites/suite-vocabulary"
import type { SupplierDetail } from "@/lib/types"

const SUPPLIER_ID = "supplier-rovos"

function seededMock() {
  return createSupabaseMock({
    suite_types: [
      { id: "st-pullman", supplier_id: SUPPLIER_ID, name: "Pullman Suite", active: true },
      { id: "st-retired", supplier_id: SUPPLIER_ID, name: "Retired Suite", active: false },
      { id: "st-other-supplier", supplier_id: "supplier-other", name: "Deluxe", active: true },
    ],
    bedroom_types: [
      { id: "bt-double", supplier_id: SUPPLIER_ID, name: "Double", archived_at: null },
      { id: "bt-archived", supplier_id: SUPPLIER_ID, name: "Old Bedding", archived_at: "2026-01-01T00:00:00.000Z" },
    ],
    bedroom_layouts: [{ id: "bl-crosswise", supplier_id: SUPPLIER_ID, name: "Crosswise", archived_at: null }],
    bathroom_types: [{ id: "ba-shower", supplier_id: SUPPLIER_ID, name: "Shower", archived_at: null }],
    suite_type_bedroom_types: [{ suite_type_id: "st-pullman", bedroom_type_id: "bt-double" }],
    suite_type_bedroom_layouts: [{ suite_type_id: "st-pullman", bedroom_layout_id: "bl-crosswise" }],
    suite_type_bathroom_types: [{ suite_type_id: "st-pullman", bathroom_type_id: "ba-shower" }],
    suite_vocab_aliases: [
      {
        id: "alias-1",
        supplier_id: SUPPLIER_ID,
        axis: "suite_type",
        phrase: "coupe for two",
        suite_type_id: "st-pullman",
        bedroom_type_id: null,
        bedroom_layout_id: null,
        bathroom_type_id: null,
        status: "confirmed",
      },
      {
        id: "alias-2",
        supplier_id: SUPPLIER_ID,
        axis: "bedroom_type",
        phrase: "twin beds please",
        suite_type_id: null,
        bedroom_type_id: "bt-double",
        bedroom_layout_id: null,
        bathroom_type_id: null,
        status: "provisional",
      },
    ],
  })
}

describe("loadSupplierSuiteVocabulary", () => {
  it("returns only active suite types and only non-archived vocab", async () => {
    const { supabase } = seededMock()

    const vocabulary = await loadSupplierSuiteVocabulary(supabase as never, SUPPLIER_ID)

    // suite_types uses an `active` boolean while the vocab tables use `archived_at` --
    // two different lifecycle conventions that both have to be honoured.
    expect(vocabulary.suiteTypes.map((entry) => entry.id)).toEqual(["st-pullman"])
    expect(vocabulary.bedroomTypes.map((entry) => entry.id)).toEqual(["bt-double"])
  })

  it("attaches the allowed variant id sets for each suite type", async () => {
    const { supabase } = seededMock()

    const vocabulary = await loadSupplierSuiteVocabulary(supabase as never, SUPPLIER_ID)
    const pullman = vocabulary.suiteTypes[0]

    expect(pullman.bedroomTypeIds.has("bt-double")).toBe(true)
    expect(pullman.bedroomLayoutIds.has("bl-crosswise")).toBe(true)
    expect(pullman.bathroomTypeIds.has("ba-shower")).toBe(true)
  })

  it("maps alias rows to their axis and resolved target id", async () => {
    const { supabase } = seededMock()

    const vocabulary = await loadSupplierSuiteVocabulary(supabase as never, SUPPLIER_ID)

    expect(vocabulary.aliases).toEqual([
      { axis: "suiteType", phrase: "coupe for two", targetId: "st-pullman", status: "confirmed" },
      { axis: "bedroomType", phrase: "twin beds please", targetId: "bt-double", status: "provisional" },
    ])
  })

  it("returns empty collections for a supplier with no vocabulary", async () => {
    const { supabase } = seededMock()

    const vocabulary = await loadSupplierSuiteVocabulary(supabase as never, "supplier-unknown")

    expect(vocabulary.suiteTypes).toEqual([])
    expect(vocabulary.aliases).toEqual([])
  })
})

describe("suiteVocabularyFromSupplierDetail", () => {
  const detail = {
    id: SUPPLIER_ID,
    suiteTypes: [
      {
        id: "st-pullman",
        name: "Pullman Suite",
        active: true,
        bedroomTypeIds: ["bt-double"],
        bedroomLayoutIds: ["bl-crosswise"],
        bathroomTypeIds: ["ba-shower"],
      },
      { id: "st-retired", name: "Retired Suite", active: false },
    ],
    bedroomTypes: [
      { id: "bt-double", name: "Double", sortOrder: 0, archivedAt: null },
      { id: "bt-archived", name: "Old Bedding", sortOrder: 1, archivedAt: "2026-01-01T00:00:00.000Z" },
    ],
    bedroomLayouts: [{ id: "bl-crosswise", name: "Crosswise", sortOrder: 0, archivedAt: null }],
    bathroomTypes: [{ id: "ba-shower", name: "Shower", sortOrder: 0, archivedAt: null }],
  } as unknown as SupplierDetail

  it("mirrors the server loader's filtering so client and server resolve identically", () => {
    const vocabulary = suiteVocabularyFromSupplierDetail(detail)

    expect(vocabulary.supplierId).toBe(SUPPLIER_ID)
    expect(vocabulary.suiteTypes.map((entry) => entry.id)).toEqual(["st-pullman"])
    expect(vocabulary.bedroomTypes.map((entry) => entry.id)).toEqual(["bt-double"])
    expect(vocabulary.suiteTypes[0].bathroomTypeIds.has("ba-shower")).toBe(true)
  })

  it("defaults aliases to empty when the payload carries none", () => {
    expect(suiteVocabularyFromSupplierDetail(detail).aliases).toEqual([])
  })

  it("passes through aliases supplied on the payload", () => {
    const withAliases = {
      ...detail,
      suiteAliases: [
        { axis: "suiteType" as const, phrase: "coupe for two", targetId: "st-pullman", status: "confirmed" as const },
      ],
    }

    expect(suiteVocabularyFromSupplierDetail(withAliases).aliases).toHaveLength(1)
  })
})
