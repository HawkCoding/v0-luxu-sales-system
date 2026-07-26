import { describe, expect, it } from "vitest"
import { createSupabaseMock, type MockRow } from "@/lib/testing/supabase-mock"
import { learnSuiteAliasesFromUnits } from "@/lib/suites/learn-from-units"

const BOOKING_ID = "booking-1"
const SUPPLIER_ID = "supplier-rovos"
const PULLMAN_ID = "st-pullman"
const ROYAL_ID = "st-royal"
const TWIN_ID = "bt-twin"

function mockWith(suiteRows: MockRow[]) {
  return createSupabaseMock({
    booking_suites: suiteRows,
    suite_types: [
      { id: PULLMAN_ID, supplier_id: SUPPLIER_ID, name: "Pullman Suite" },
      { id: ROYAL_ID, supplier_id: SUPPLIER_ID, name: "Royal Suite" },
    ],
    suite_vocab_aliases: [],
  })
}

const unresolvedSuite = {
  id: "bs-1",
  booking_id: BOOKING_ID,
  suite_number: 1,
  suite_type_id: null,
  bedroom_type_id: null,
  bedroom_layout_id: null,
  bathroom_type_id: null,
  source_phrase: "coupe for two",
}

describe("learnSuiteAliasesFromUnits", () => {
  it("records an alias when the consultant fills a gap the resolver left", async () => {
    const { supabase, store } = mockWith([unresolvedSuite])

    await learnSuiteAliasesFromUnits(supabase as never, BOOKING_ID, [{ suiteTypeId: PULLMAN_ID }], "user-1")

    const aliases = store.rows("suite_vocab_aliases")
    expect(aliases).toHaveLength(1)
    expect(aliases[0]).toMatchObject({
      supplier_id: SUPPLIER_ID,
      axis: "suite_type",
      phrase: "coupe for two",
      suite_type_id: PULLMAN_ID,
      status: "provisional",
    })
  })

  it("records an alias when the consultant overrides a wrong guess", async () => {
    const { supabase, store } = mockWith([{ ...unresolvedSuite, suite_type_id: PULLMAN_ID }])

    await learnSuiteAliasesFromUnits(supabase as never, BOOKING_ID, [{ suiteTypeId: ROYAL_ID }], "user-1")

    expect(store.rows("suite_vocab_aliases")[0]).toMatchObject({ suite_type_id: ROYAL_ID })
  })

  it("learns nothing when the selection matches what was already captured", async () => {
    const { supabase, store } = mockWith([{ ...unresolvedSuite, suite_type_id: PULLMAN_ID }])

    // Re-saving an unchanged selection is not a correction; it must not touch the alias table.
    await learnSuiteAliasesFromUnits(supabase as never, BOOKING_ID, [{ suiteTypeId: PULLMAN_ID }], "user-1")

    expect(store.rows("suite_vocab_aliases")).toHaveLength(0)
  })

  it("learns config axes alongside the suite type", async () => {
    const { supabase, store } = mockWith([unresolvedSuite])

    await learnSuiteAliasesFromUnits(
      supabase as never,
      BOOKING_ID,
      [{ suiteTypeId: PULLMAN_ID, bedroomTypeId: TWIN_ID }],
      "user-1",
    )

    const axes = store.rows("suite_vocab_aliases").map((row) => row.axis).sort()
    expect(axes).toEqual(["bedroom_type", "suite_type"])
  })

  it("learns nothing when the enquiry captured no raw wording to key on", async () => {
    const { supabase, store } = mockWith([{ ...unresolvedSuite, source_phrase: null }])

    await learnSuiteAliasesFromUnits(supabase as never, BOOKING_ID, [{ suiteTypeId: PULLMAN_ID }], "user-1")

    expect(store.rows("suite_vocab_aliases")).toHaveLength(0)
  })

  it("ignores units with no suite type chosen", async () => {
    const { supabase, store } = mockWith([unresolvedSuite])

    await learnSuiteAliasesFromUnits(supabase as never, BOOKING_ID, [{ suiteTypeId: null }], "user-1")

    expect(store.rows("suite_vocab_aliases")).toHaveLength(0)
  })
})
