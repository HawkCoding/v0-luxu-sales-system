import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { priceExtraLineItems } from "@/lib/quotes/price-extra-line"

const JOB_ID = "00000000-0000-4000-8000-00000000aaaa"
const SUPPLIER_ID = "supplier-rovos"
const ROUTE_ID = "route-ctj"
const SUITE_ID = "suite-pullman"

const SADC = "rate-type-rvsadc"
const BTLD = "rate-type-btld"

interface RateCardRow {
  id: string
  rate_type_id: string
  price_per_person: number
  child_price: number | null
  infant_price: number | null
  valid_from: string
  valid_to: string | null
}

const SADC_2026: RateCardRow = {
  id: "rc-sadc-2026",
  rate_type_id: SADC,
  price_per_person: 22500,
  child_price: 11250,
  infant_price: null,
  valid_from: "2026-06-30",
  valid_to: "2026-09-30",
}

const BTLD_OPEN: RateCardRow = {
  id: "rc-btld-open",
  rate_type_id: BTLD,
  price_per_person: 59900,
  child_price: 29950,
  infant_price: null,
  valid_from: "2026-01-01",
  valid_to: null,
}

/** Minimal chainable supabase mock covering the tables price-extra-line touches. */
function buildSupabase(
  rateCards: RateCardRow[],
  supplierRateTiers: { base_rate_type_id: string | null; quote_rate_type_id: string | null } = {
    base_rate_type_id: null,
    quote_rate_type_id: null,
  },
) {
  const results: Record<string, { data: unknown; error: null }> = {
    bookings: {
      data: { no_of_adults: 2, no_of_children: 1, no_of_suites: 1, child_ages: [8] },
      error: null,
    },
    suppliers: {
      data: {
        id: SUPPLIER_ID,
        name: "Rovos Rail",
        kind: "train_operator",
        infant_max_age: null,
        child_max_age: null,
        ...supplierRateTiers,
      },
      error: null,
    },
    routes: {
      data: { id: ROUTE_ID, name: "Cape Town Journey", supplier_id: SUPPLIER_ID, direction_mode: "one_way" },
      error: null,
    },
    suite_types: { data: { id: SUITE_ID, name: "Pullman Suite", supplier_id: SUPPLIER_ID }, error: null },
    rate_cards: { data: rateCards, error: null },
    rate_types: {
      data: [
        { id: SADC, code: "RVSADC", name: "Rovos Rail SADC" },
        { id: BTLD, code: "BTLD", name: "Blue Train Domestic Rate" },
      ],
      error: null,
    },
  }

  function chain(result: { data: unknown; error: null }) {
    const self: Record<string, unknown> = {}
    for (const method of ["select", "eq", "in", "order", "is", "or"]) {
      self[method] = () => self
    }
    self.single = async () => result
    self.maybeSingle = async () => result
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return self
  }

  return {
    from: (table: string) => chain(results[table] ?? { data: [], error: null }),
  } as unknown as SupabaseClient<Database>
}

function price(travelDate: string, rateTypeId: string | null, rateCards: RateCardRow[] = [SADC_2026, BTLD_OPEN]) {
  return priceExtraLineItems({
    supabase: buildSupabase(rateCards),
    jobId: JOB_ID,
    travelDate,
    supplierId: SUPPLIER_ID,
    routeId: ROUTE_ID,
    suiteTypeId: SUITE_ID,
    rateTypeId,
    fallbackRateTypeId: BTLD,
  })
}

describe("priceExtraLineItems", () => {
  it("refuses to price a chosen rate off another rate type's card", async () => {
    await expect(price("2028-08-25", SADC)).rejects.toThrow(
      /No "Rovos Rail SADC" rate covers 2028-08-25 .*Extend that rate's validity period/,
    )
  })

  it("names the rate type when it was never priced on this route", async () => {
    await expect(price("2026-08-25", "rate-type-nett")).rejects.toThrow(
      /"rate-type-nett" has no rate card for "Pullman Suite" on "Cape Town Journey"/,
    )
  })

  it("prices at the chosen rate when its card covers the date", async () => {
    const { lineItems } = await price("2026-08-25", SADC)
    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine?.unitPrice).toBe(22500)
    expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(SADC)
  })

  it("stamps rate type code and name into the snapshot, matching package lines", async () => {
    const { lineItems } = await price("2026-08-25", SADC)
    const snapshot = lineItems[0]?.pricingSnapshot
    expect(snapshot?.rateTypeCode).toBe("RVSADC")
    expect(snapshot?.rateTypeName).toBe("Rovos Rail SADC")
    expect(snapshot?.rateTypeInherited).toBe(false)
    expect(snapshot?.isExtra).toBe(true)
  })

  it("inherits the fallback rate type when none is chosen, and marks it inherited", async () => {
    const { lineItems } = await price("2028-08-25", null)
    const adultLine = lineItems.find((li) => li.description.includes("Adult"))
    expect(adultLine?.unitPrice).toBe(59900)
    expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(BTLD)
    expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(true)
  })

  it("reports the date, not the rate type, when nothing covers the travel date", async () => {
    await expect(price("2020-01-01", SADC)).rejects.toThrow(/No rate card covers 2020-01-01/)
  })

  describe("the supplier's quoted rate", () => {
    function priceInherited(travelDate: string) {
      return priceExtraLineItems({
        supabase: buildSupabase([SADC_2026, BTLD_OPEN], {
          base_rate_type_id: BTLD,
          quote_rate_type_id: SADC,
        }),
        jobId: JOB_ID,
        travelDate,
        supplierId: SUPPLIER_ID,
        routeId: ROUTE_ID,
        suiteTypeId: SUITE_ID,
        rateTypeId: null,
        fallbackRateTypeId: BTLD,
      })
    }

    it("is used when no rate is chosen on the line", async () => {
      const { lineItems } = await priceInherited("2026-08-25")
      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      expect(adultLine?.unitPrice).toBe(22500)
      expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(SADC)
      expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(true)
    })

    // Inherited, not asked for: a missing card falls back rather than failing the way an
    // explicit choice does. Extras follow the package builder here so the two can't drift.
    it("falls through to the base rate when it has no card for the date", async () => {
      const { lineItems } = await priceInherited("2028-08-25")
      const adultLine = lineItems.find((li) => li.description.includes("Adult"))
      expect(adultLine?.unitPrice).toBe(59900)
      expect(adultLine?.pricingSnapshot?.rateTypeId).toBe(BTLD)
      expect(adultLine?.pricingSnapshot?.rateTypeInherited).toBe(true)
    })
  })
})
