import { describe, expect, it } from "vitest"
import {
  collectForeignCurrencies,
  legsToServiceRows,
  reconcileDraftServiceRows,
  type ServiceRow,
} from "./build-booking-dialog"
import type { SupplierKind, SupplierRateCard } from "@/lib/types"
import type { SuiteLegState, SuiteUnitState } from "@/lib/packages/apply-dialog-state"

// Minimal leg shape -- legsToServiceRows/reconcileDraftServiceRows only read these fields (see
// ServiceRowSourceLeg in build-booking-dialog.tsx).
function leg(id: string, supplierId: string, sortOrder: number) {
  return {
    id,
    sortOrder,
    supplierId,
    supplierKind: "transfers" as const,
    supplierName: `Supplier ${supplierId}`,
  }
}

describe("legsToServiceRows", () => {
  it("carries the leg id as legId, sorted by sortOrder", () => {
    const rows = legsToServiceRows([leg("leg-2", "sup-a", 1), leg("leg-1", "sup-a", 0)])
    expect(rows.map((r) => r.legId)).toEqual(["leg-1", "leg-2"])
  })
})

describe("reconcileDraftServiceRows", () => {
  // This is the regression this pair of helpers exists to fix: two rows for the same supplier
  // (e.g. arrival + departure transfers) whose draft copy has no legId used to reach
  // POST /build-booking untagged and get rejected with "already has more than one service for X".
  it("pairs legId-less duplicate-supplier draft rows to distinct legs, in order", () => {
    const draft: ServiceRow[] = [
      { key: "a", supplierId: "wild-horizons", supplierKind: "transfers", supplierName: "Wild Horizons" },
      { key: "b", supplierId: "wild-horizons", supplierKind: "transfers", supplierName: "Wild Horizons" },
    ]
    const legs = [leg("leg-arrival", "wild-horizons", 0), leg("leg-departure", "wild-horizons", 1)]

    const result = reconcileDraftServiceRows(draft, legs)

    expect(result.map((r) => r.legId)).toEqual(["leg-arrival", "leg-departure"])
  })

  it("prefers a matching legId over positional supplier matching", () => {
    const draft: ServiceRow[] = [
      { key: "a", legId: "leg-departure", supplierId: "wild-horizons", supplierKind: "transfers", supplierName: "Wild Horizons" },
      { key: "b", supplierId: "wild-horizons", supplierKind: "transfers", supplierName: "Wild Horizons" },
    ]
    const legs = [leg("leg-arrival", "wild-horizons", 0), leg("leg-departure", "wild-horizons", 1)]

    const result = reconcileDraftServiceRows(draft, legs)

    expect(result.map((r) => r.legId)).toEqual(["leg-departure", "leg-arrival"])
  })

  it("leaves a genuinely new row (no leg left to claim) untouched", () => {
    const draft: ServiceRow[] = [
      { key: "a", supplierId: "wild-horizons", supplierKind: "transfers", supplierName: "Wild Horizons" },
    ]

    const result = reconcileDraftServiceRows(draft, [])

    expect(result).toEqual(draft)
  })
})

function card(overrides: Partial<SupplierRateCard> & { suiteTypeId: string }): SupplierRateCard {
  return {
    id: `card-${overrides.suiteTypeId}-${overrides.rateTypeId ?? "default"}`,
    // Tour operators price the type across every itinerary, so their cards carry no route.
    routeId: null,
    rateTypeId: "rate-standard",
    pricePerPerson: 63,
    childPrice: null,
    infantPrice: null,
    currency: "USD",
    validFrom: "2020-01-01",
    validTo: null,
    createdAt: "",
    ...overrides,
  }
}

function currencyLeg(overrides: { id: string; supplierKind: SupplierKind; rateCards: SupplierRateCard[] }) {
  return {
    pricingMode: "rate_card" as const,
    quoteRateTypeId: null,
    baseRateTypeId: null,
    ...overrides,
  }
}

function unit(overrides: Partial<SuiteUnitState> & { suiteTypeId: string | null }): SuiteUnitState {
  return {
    id: "unit-1",
    bedroomTypeId: null,
    bedroomLayoutId: null,
    bathroomTypeId: null,
    adultCount: 2,
    childCount: 0,
    infantCount: 0,
    manualAdultPrice: null,
    manualChildPrice: null,
    manualInfantPrice: null,
    manualRoomPrice: null,
    complimentaryFirstNight: false,
    manualTourPrice: null,
    rateTypeId: null,
    ...overrides,
  }
}

function suiteState(overrides: Partial<SuiteLegState> & { legId: string }): SuiteLegState {
  return {
    kind: "suite",
    supplierKind: "tour_operator",
    accommodationPricingBasis: "per_person",
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: "2026-11-22",
    nights: null,
    departureTime: null,
    arrivalDate: null,
    arrivalTime: null,
    flightNumber: null,
    departureAirportCode: null,
    arrivalAirportCode: null,
    handLuggageKg: null,
    checkedLuggageKg: null,
    dateAnchor: null,
    notes: null,
    luggageStorageAvailable: false,
    rateTypeId: null,
    priceCurrency: "ZAR",
    units: [],
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
    ...overrides,
  }
}

describe("collectForeignCurrencies", () => {
  const systemDefaultRateTypeId = "rate-standard"

  // The regression: a tour operator's itinerary is descriptive only and is auto-derived just when
  // exactly one matches the chosen tour type, so routeId is usually null. Requiring one skipped the
  // whole leg, and a USD tour on a ZAR quote silently converted at a rate the FX banner never showed.
  it("finds a tour operator's foreign card with no itinerary selected", () => {
    const result = collectForeignCurrencies({
      legs: [
        currencyLeg({
          id: "leg-tour",
          supplierKind: "tour_operator",
          rateCards: [card({ suiteTypeId: "sundowner-cruise", currency: "USD" })],
        }),
      ],
      legStates: [suiteState({ legId: "leg-tour", routeId: null, units: [unit({ suiteTypeId: "sundowner-cruise" })] })],
      quoteCurrency: "ZAR",
      systemDefaultRateTypeId,
    })

    expect(result).toEqual(["USD"])
  })

  it("stays empty when the tour's card is already the quote's currency", () => {
    const result = collectForeignCurrencies({
      legs: [
        currencyLeg({
          id: "leg-tour",
          supplierKind: "tour_operator",
          rateCards: [card({ suiteTypeId: "sundowner-cruise", currency: "ZAR" })],
        }),
      ],
      legStates: [suiteState({ legId: "leg-tour", units: [unit({ suiteTypeId: "sundowner-cruise" })] })],
      quoteCurrency: "ZAR",
      systemDefaultRateTypeId,
    })

    expect(result).toEqual([])
  })

  // Every other kind prices per route, so a leg with none picked genuinely cannot resolve a card yet
  // and must not guess -- the banner would flash speculatively.
  it("still requires a route on a route-priced supplier", () => {
    const result = collectForeignCurrencies({
      legs: [
        currencyLeg({
          id: "leg-train",
          supplierKind: "train_operator",
          rateCards: [card({ suiteTypeId: "pullman", routeId: "route-cpt", currency: "USD" })],
        }),
      ],
      legStates: [
        suiteState({
          legId: "leg-train",
          supplierKind: "train_operator",
          routeId: null,
          units: [unit({ suiteTypeId: "pullman" })],
        }),
      ],
      quoteCurrency: "ZAR",
      systemDefaultRateTypeId,
    })

    expect(result).toEqual([])
  })

  it("ignores a tour leg that is not configured enough to price", () => {
    const legs = [
      currencyLeg({
        id: "leg-tour",
        supplierKind: "tour_operator",
        rateCards: [card({ suiteTypeId: "sundowner-cruise", currency: "USD" })],
      }),
    ]

    expect(
      collectForeignCurrencies({
        legs,
        legStates: [suiteState({ legId: "leg-tour", serviceDate: null, units: [unit({ suiteTypeId: "sundowner-cruise" })] })],
        quoteCurrency: "ZAR",
        systemDefaultRateTypeId,
      }),
    ).toEqual([])

    expect(
      collectForeignCurrencies({
        legs,
        legStates: [suiteState({ legId: "leg-tour", units: [unit({ suiteTypeId: null })] })],
        quoteCurrency: "ZAR",
        systemDefaultRateTypeId,
      }),
    ).toEqual([])
  })

  it("skips a deselected leg", () => {
    const result = collectForeignCurrencies({
      legs: [
        currencyLeg({
          id: "leg-tour",
          supplierKind: "tour_operator",
          rateCards: [card({ suiteTypeId: "sundowner-cruise", currency: "USD" })],
        }),
      ],
      legStates: [
        suiteState({ legId: "leg-tour", selected: false, units: [unit({ suiteTypeId: "sundowner-cruise" })] }),
      ],
      quoteCurrency: "ZAR",
      systemDefaultRateTypeId,
    })

    expect(result).toEqual([])
  })

  // Tours resolve their rate type per unit, and two rate types can price in different currencies --
  // the leg's own rateTypeId alone resolves the wrong card here.
  it("resolves each tour unit against its own rate type", () => {
    const result = collectForeignCurrencies({
      legs: [
        currencyLeg({
          id: "leg-tour",
          supplierKind: "tour_operator",
          rateCards: [
            card({ suiteTypeId: "sundowner-cruise", rateTypeId: "rate-standard", currency: "ZAR" }),
            card({ suiteTypeId: "sundowner-cruise", rateTypeId: "rate-regional", currency: "USD" }),
          ],
        }),
      ],
      legStates: [
        suiteState({
          legId: "leg-tour",
          rateTypeId: null,
          units: [unit({ id: "unit-regional", suiteTypeId: "sundowner-cruise", rateTypeId: "rate-regional" })],
        }),
      ],
      quoteCurrency: "ZAR",
      systemDefaultRateTypeId,
    })

    expect(result).toEqual(["USD"])
  })
})
