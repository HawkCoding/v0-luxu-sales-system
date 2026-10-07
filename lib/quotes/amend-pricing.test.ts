import { describe, expect, it } from "vitest"
import { convertAmount } from "@/lib/pricing/convert-currency"
import type { PricingSnapshot, QuoteLineItem } from "@/lib/types"
import {
  amendLineKey,
  findChangedExistingLines,
  mergeAmendFxRates,
  rebuildAcceptedQuoteFxRates,
} from "./amend-pricing"

function snap(overrides: Partial<PricingSnapshot>): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "",
    packageName: "",
    legId: null,
    legLabel: null,
    supplierId: null,
    supplierName: null,
    supplierKind: null,
    routeId: null,
    routeName: null,
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "2026-06-01",
    passengerKind: "adult",
    baseUnitPrice: 0,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...overrides,
  }
}

function line(description: string, unitPrice: number, snapshot: Partial<PricingSnapshot> | null, qty = 1): QuoteLineItem {
  return {
    description,
    supplierDescription: null,
    qty,
    unitPrice,
    total: unitPrice * qty,
    pricingSnapshot: snapshot ? snap(snapshot) : null,
  }
}

describe("rebuildAcceptedQuoteFxRates", () => {
  it("takes the stamped fxRate as the base-relative rate on a ZAR quote", () => {
    const result = rebuildAcceptedQuoteFxRates(
      [line("Train", 1725, { sourceCurrency: "USD", fxRate: 17.25 }), line("Hotel", 2000, { sourceCurrency: "EUR", fxRate: 20.1 })],
      "ZAR",
      { ZAR: 1, USD: 18.4, EUR: 21 },
    )

    expect(result.rates).toEqual({ USD: 17.25, EUR: 20.1 })
    expect(result.prefilledCurrencies).toEqual(["EUR", "USD"])
  })

  it("leaves a currency that only a new line uses to the current rate (absent from the overrides)", () => {
    const result = rebuildAcceptedQuoteFxRates([line("Train", 1725, { sourceCurrency: "USD", fxRate: 17.25 })], "ZAR", {
      USD: 18,
      GBP: 23,
    })

    expect(result.rates.GBP).toBeUndefined()
    expect({ USD: 18, GBP: 23, ...result.rates }).toEqual({ USD: 17.25, GBP: 23 })
  })

  it("reproduces each stamped cross rate on a non-base quote, anchored by a ZAR-sourced line", () => {
    // USD quote: a ZAR hotel converted at 0.058 (1 ZAR = 0.058 USD) and a EUR tour at 1.09.
    const result = rebuildAcceptedQuoteFxRates(
      [line("Hotel", 58, { sourceCurrency: "ZAR", fxRate: 0.058 }), line("Tour", 109, { sourceCurrency: "EUR", fxRate: 1.09 })],
      "USD",
      { USD: 18, EUR: 20 },
    )
    const merged = { USD: 18, EUR: 20, ...result.rates, ZAR: 1 }

    expect(convertAmount(1000, "ZAR", "USD", merged).rate).toBe(0.058)
    expect(convertAmount(100, "EUR", "USD", merged).rate).toBe(1.09)
    expect(result.prefilledCurrencies).toEqual(["EUR", "ZAR"])
  })

  it("anchors a non-base quote on today's quote-currency rate when no ZAR line exists", () => {
    const result = rebuildAcceptedQuoteFxRates([line("Tour", 109, { sourceCurrency: "EUR", fxRate: 1.09 })], "USD", {
      USD: 18.3,
      EUR: 20,
    })
    const merged = { USD: 18.3, EUR: 20, ...result.rates, ZAR: 1 }

    expect(convertAmount(100, "EUR", "USD", merged).rate).toBe(1.09)
  })

  it("ignores native lines, lines without a stamped rate, and nonsense rates", () => {
    const result = rebuildAcceptedQuoteFxRates(
      [
        line("Native", 1000, { sourceCurrency: "ZAR", fxRate: 1 }),
        line("Unstamped", 1000, { sourceCurrency: "USD", fxRate: null }),
        line("Broken", 1000, { sourceCurrency: "EUR", fxRate: -2 }),
        line("Manual", 1000, null),
      ],
      "ZAR",
      { USD: 18 },
    )

    expect(result).toEqual({ rates: {}, prefilledCurrencies: [] })
  })
})

describe("mergeAmendFxRates", () => {
  it("layers cache, then the accepted defaults, then what the salesperson typed; base pinned to 1", () => {
    const merged = mergeAmendFxRates({
      cachedRates: { ZAR: 2, USD: 18, EUR: 20, GBP: 23 },
      accepted: { USD: 17.25, EUR: 19.5 },
      clientRates: { EUR: 21 },
    })
    expect(merged).toEqual({ ZAR: 1, USD: 17.25, EUR: 21, GBP: 23 })
  })

  it("keeps the unrounded accepted rate when the client sends the prefill back rounded to 6dp", () => {
    // A non-ZAR quote: the rebuilt default carries more than 6 decimals.
    const accepted = { EUR: 1.09 * 18.3 + 1e-9 }
    const merged = mergeAmendFxRates({
      cachedRates: { USD: 18.3, EUR: 20 },
      accepted,
      clientRates: { EUR: Math.round(accepted.EUR * 1e6) / 1e6 },
    })
    expect(merged.EUR).toBe(accepted.EUR)
  })
})

describe("amendLineKey", () => {
  it("keys a priced line by its leg, suite, passenger kind and trip — not the description", () => {
    const before = line("Blue Train 1 June — Deluxe Suite - Adult", 50000, { legId: "leg-1", suiteTypeId: "s-1" })
    const after = line("Blue Train 2 June — Deluxe Suite - Adult", 50000, { legId: "leg-1", suiteTypeId: "s-1" })
    expect(amendLineKey(before)).toBe(amendLineKey(after))
    expect(amendLineKey(line("x", 1, { legId: "leg-1", suiteTypeId: "s-1", passengerKind: "child" }))).not.toBe(
      amendLineKey(before),
    )
  })

  it("falls back to the description for a line priced without a leg", () => {
    expect(amendLineKey(line("Ad-hoc extra", 100, null))).toBe("desc:ad-hoc extra")
  })
})

describe("findChangedExistingLines", () => {
  const trainAdult = (price: number, description = "Blue Train fare") =>
    line(description, price, { legId: "leg-train", suiteTypeId: "suite-deluxe", passengerKind: "adult" }, 2)

  it("reports an existing line whose unit price moved (a rate card edited since acceptance)", () => {
    const changed = findChangedExistingLines([trainAdult(50000)], [trainAdult(51200)])
    expect(changed).toEqual([{ description: "Blue Train fare", before: 50000, after: 51200 }])
  })

  it("matches by snapshot identity even when the description changed", () => {
    const changed = findChangedExistingLines([trainAdult(50000, "Blue Train 1 June")], [trainAdult(50000, "Blue Train 3 June")])
    expect(changed).toEqual([])
  })

  it("never lists a genuinely new line, and ignores a quantity change", () => {
    const extraNight = line("Cape Grace", 4000, { legId: "leg-hotel", suiteTypeId: "room", passengerKind: "adult" }, 3)
    const changed = findChangedExistingLines(
      [trainAdult(50000), line("Cape Grace", 4000, { legId: "leg-hotel", suiteTypeId: "room", passengerKind: "adult" }, 2)],
      [trainAdult(50000), extraNight, line("Table Mountain tour", 900, { legId: "leg-tour", passengerKind: "adult" })],
    )
    expect(changed).toEqual([])
  })

  it("skips the Commission line, which re-prices off the subtotal by design", () => {
    const commission = (amount: number) =>
      line("Commission", amount, { passengerKind: "service", commission: { type: "percent", value: 10, amount, source: "line" } })
    expect(findChangedExistingLines([commission(5000)], [commission(5400)])).toEqual([])
  })

  it("pairs repeated keys in order", () => {
    const transfer = (price: number) => line("Transfer", price, { legId: "leg-transfer", passengerKind: "service" })
    const changed = findChangedExistingLines([transfer(800), transfer(900)], [transfer(800), transfer(950)])
    expect(changed).toEqual([{ description: "Transfer", before: 900, after: 950 }])
  })

  it("matches a leg-less line by description", () => {
    const changed = findChangedExistingLines([line("Ad-hoc extra", 100, null)], [line("Ad-hoc extra", 120, null)])
    expect(changed).toEqual([{ description: "Ad-hoc extra", before: 100, after: 120 }])
  })
})
