import { describe, expect, it } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"
import { promoteSuiteAliases, recordSuiteAliasCorrections } from "@/lib/suites/suite-alias-store"

const SUPPLIER_ID = "supplier-rovos"
const OTHER_SUPPLIER_ID = "supplier-blue-train"
const PULLMAN_SUITE_ID = "rv-pullman-suite"
const ROYAL_SUITE_ID = "rv-royal-suite"
const ACTOR_ID = "user-1"

function aliasRows(store: { rows(table: string): MockRow[] }): MockRow[] {
  return store.rows("suite_vocab_aliases")
}

describe("recordSuiteAliasCorrections", () => {
  it("records a first-time correction as provisional, normalizing the phrase", () => {
    const { supabase, store } = createSupabaseMock({ suite_vocab_aliases: [] })

    return recordSuiteAliasCorrections(
      supabase as never,
      [{ supplierId: SUPPLIER_ID, phrase: "Coupé for TWO", axis: "suiteType", targetId: PULLMAN_SUITE_ID }],
      ACTOR_ID,
    ).then(() => {
      const rows = aliasRows(store)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        supplier_id: SUPPLIER_ID,
        axis: "suite_type",
        phrase: "coupe for two",
        suite_type_id: PULLMAN_SUITE_ID,
        status: "provisional",
        created_by: ACTOR_ID,
      })
    })
  })

  it("writes one row per axis for a composite phrase", async () => {
    const { supabase, store } = createSupabaseMock({ suite_vocab_aliases: [] })

    await recordSuiteAliasCorrections(
      supabase as never,
      [
        { supplierId: SUPPLIER_ID, phrase: "deluxe twin with shower", axis: "suiteType", targetId: "st-1" },
        { supplierId: SUPPLIER_ID, phrase: "deluxe twin with shower", axis: "bedroomType", targetId: "bt-1" },
        { supplierId: SUPPLIER_ID, phrase: "deluxe twin with shower", axis: "bathroomType", targetId: "ba-1" },
      ],
      ACTOR_ID,
    )

    const rows = aliasRows(store)
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.axis).sort()).toEqual(["bathroom_type", "bedroom_type", "suite_type"])
    // All three share the phrase; only the axis and its target column differ.
    expect(new Set(rows.map((row) => row.phrase))).toEqual(new Set(["deluxe twin with shower"]))
    expect(rows.find((row) => row.axis === "bedroom_type")).toMatchObject({
      bedroom_type_id: "bt-1",
      suite_type_id: null,
    })
  })

  it("skips blank phrases", async () => {
    const { supabase, store } = createSupabaseMock({ suite_vocab_aliases: [] })

    await recordSuiteAliasCorrections(
      supabase as never,
      [{ supplierId: SUPPLIER_ID, phrase: "   ", axis: "suiteType", targetId: PULLMAN_SUITE_ID }],
      ACTOR_ID,
    )

    expect(aliasRows(store)).toHaveLength(0)
  })

  it("replaces the target and demotes back to provisional when a confirmed alias is corrected", async () => {
    const { supabase, store } = createSupabaseMock({
      suite_vocab_aliases: [
        {
          id: "alias-1",
          supplier_id: SUPPLIER_ID,
          axis: "suite_type",
          phrase: "coupe for two",
          suite_type_id: PULLMAN_SUITE_ID,
          bedroom_type_id: null,
          bedroom_layout_id: null,
          bathroom_type_id: null,
          status: "confirmed",
          confirmed_at: "2026-07-01T00:00:00.000Z",
          hit_count: 5,
        },
      ],
    })

    await recordSuiteAliasCorrections(
      supabase as never,
      [{ supplierId: SUPPLIER_ID, phrase: "coupe for two", axis: "suiteType", targetId: ROYAL_SUITE_ID }],
      ACTOR_ID,
    )

    const rows = aliasRows(store)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      suite_type_id: ROYAL_SUITE_ID,
      status: "provisional",
      confirmed_at: null,
    })
  })

  it("leaves an existing alias untouched when the same target is re-selected", async () => {
    const { supabase, store } = createSupabaseMock({
      suite_vocab_aliases: [
        {
          id: "alias-1",
          supplier_id: SUPPLIER_ID,
          axis: "suite_type",
          phrase: "coupe for two",
          suite_type_id: PULLMAN_SUITE_ID,
          bedroom_type_id: null,
          bedroom_layout_id: null,
          bathroom_type_id: null,
          status: "confirmed",
          confirmed_at: "2026-07-01T00:00:00.000Z",
          hit_count: 5,
        },
      ],
    })

    await recordSuiteAliasCorrections(
      supabase as never,
      [{ supplierId: SUPPLIER_ID, phrase: "coupe for two", axis: "suiteType", targetId: PULLMAN_SUITE_ID }],
      ACTOR_ID,
    )

    // Re-confirming the same answer is not a correction -- it must not demote the row.
    expect(aliasRows(store)[0]).toMatchObject({
      status: "confirmed",
      confirmed_at: "2026-07-01T00:00:00.000Z",
      hit_count: 5,
    })
  })

  it("keeps the same phrase independent per supplier", async () => {
    const { supabase, store } = createSupabaseMock({ suite_vocab_aliases: [] })

    await recordSuiteAliasCorrections(
      supabase as never,
      [
        { supplierId: SUPPLIER_ID, phrase: "coupe for two", axis: "suiteType", targetId: PULLMAN_SUITE_ID },
        { supplierId: OTHER_SUPPLIER_ID, phrase: "coupe for two", axis: "suiteType", targetId: "bt-deluxe" },
      ],
      ACTOR_ID,
    )

    const rows = aliasRows(store)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.suite_type_id).sort()).toEqual(["bt-deluxe", PULLMAN_SUITE_ID].sort())
  })
})

describe("promoteSuiteAliases", () => {
  function seedProvisional() {
    return createSupabaseMock({
      suite_vocab_aliases: [
        {
          id: "alias-1",
          supplier_id: SUPPLIER_ID,
          axis: "suite_type",
          phrase: "coupe for two",
          suite_type_id: PULLMAN_SUITE_ID,
          status: "provisional",
          confirmed_at: null,
          hit_count: 0,
        },
      ],
    })
  }

  it("promotes a provisional alias to confirmed when its suggestion survives an unedited save", async () => {
    const { supabase, store } = seedProvisional()

    await promoteSuiteAliases(supabase as never, SUPPLIER_ID, "Coupé for two", ["suiteType"])

    const row = aliasRows(store)[0]
    expect(row.status).toBe("confirmed")
    expect(row.confirmed_at).toBeTruthy()
    expect(row.hit_count).toBe(1)
  })

  it("is idempotent on an already-confirmed alias: bumps hit_count without re-stamping confirmed_at", async () => {
    const { supabase, store } = createSupabaseMock({
      suite_vocab_aliases: [
        {
          id: "alias-1",
          supplier_id: SUPPLIER_ID,
          axis: "suite_type",
          phrase: "coupe for two",
          suite_type_id: PULLMAN_SUITE_ID,
          status: "confirmed",
          confirmed_at: "2026-07-01T00:00:00.000Z",
          hit_count: 3,
        },
      ],
    })

    await promoteSuiteAliases(supabase as never, SUPPLIER_ID, "coupe for two", ["suiteType"])

    expect(aliasRows(store)[0]).toMatchObject({
      status: "confirmed",
      confirmed_at: "2026-07-01T00:00:00.000Z",
      hit_count: 4,
    })
  })

  it("does not promote another supplier's identical phrase", async () => {
    const { supabase, store } = seedProvisional()

    await promoteSuiteAliases(supabase as never, OTHER_SUPPLIER_ID, "coupe for two", ["suiteType"])

    expect(aliasRows(store)[0].status).toBe("provisional")
  })

  it("does nothing for a blank phrase or an empty axis list", async () => {
    const { supabase, store } = seedProvisional()

    await promoteSuiteAliases(supabase as never, SUPPLIER_ID, "   ", ["suiteType"])
    await promoteSuiteAliases(supabase as never, SUPPLIER_ID, "coupe for two", [])

    expect(aliasRows(store)[0].status).toBe("provisional")
  })
})
