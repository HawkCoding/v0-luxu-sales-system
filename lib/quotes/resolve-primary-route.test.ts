import { describe, expect, it, vi } from "vitest"
import {
  resolvePrimaryRoute,
  resolvePrimarySupplier,
  resolvePrimarySupplierId,
  syncBookingRoute,
} from "@/lib/quotes/resolve-primary-route"
import type { PricingSnapshot } from "@/lib/types"

function snapshot(overrides: Partial<PricingSnapshot>): PricingSnapshot {
  return {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "pkg-1",
    packageName: "Test Package",
    legId: "leg-1",
    legLabel: "Leg",
    supplierId: "sup-1",
    supplierName: "Supplier",
    supplierKind: "train_operator",
    routeId: "route-1",
    routeName: "Pretoria ↔ Cape Town",
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    travelDate: "2026-09-20",
    passengerKind: "adult",
    baseUnitPrice: 100,
    markupPct: 0,
    singleSupplementPct: null,
    serviceType: null,
    ...overrides,
  }
}

describe("resolvePrimaryRoute", () => {
  it("prefers the train leg's route over other legs", () => {
    const result = resolvePrimaryRoute([
      {
        pricingSnapshot: snapshot({
          supplierKind: "transfers",
          routeId: "route-transfer",
          routeName: "Airport ↔ V&A Waterfront",
        }),
      },
      { pricingSnapshot: snapshot({ supplierKind: "train_operator", routeId: "route-train", routeName: "Pretoria ↔ Cape Town" }) },
    ],
    { primarySupplierId: null },
  )

    expect(result).toEqual({ routeId: "route-train", routeName: "Pretoria ↔ Cape Town", routeReversed: false })
  })

  it("carries the winning snapshot's routeReversed flag", () => {
    const result = resolvePrimaryRoute([
      {
        pricingSnapshot: snapshot({
          supplierKind: "train_operator",
          routeId: "route-train",
          routeName: "Pretoria → Cape Town",
          routeReversed: true,
        }),
      },
    ],
    { primarySupplierId: null },
  )

    expect(result).toEqual({ routeId: "route-train", routeName: "Pretoria → Cape Town", routeReversed: true })
  })

  it("falls back to the first snapshot with a route when no train leg exists", () => {
    const result = resolvePrimaryRoute([
      { pricingSnapshot: null },
      {
        pricingSnapshot: snapshot({
          supplierKind: "transfers",
          routeId: "route-transfer",
          routeName: "Airport ↔ Hotel",
        }),
      },
    ],
    { primarySupplierId: null },
  )

    expect(result).toEqual({ routeId: "route-transfer", routeName: "Airport ↔ Hotel", routeReversed: false })
  })

  it("ignores snapshots without a routeId", () => {
    const result = resolvePrimaryRoute([
      { pricingSnapshot: snapshot({ supplierKind: "hotel_property", routeId: null, routeName: null }) },
    ],
    { primarySupplierId: null },
  )

    expect(result).toEqual({ routeId: null, routeName: null, routeReversed: false })
  })

  it("returns nulls for manual line items without snapshots", () => {
    expect(resolvePrimaryRoute([{ pricingSnapshot: null }, {}], { primarySupplierId: null })).toEqual({
      routeId: null,
      routeName: null,
      routeReversed: false,
    })
  })

  it("excludes hotel legs — their route is a meal plan, not a journey", () => {
    const result = resolvePrimaryRoute([
      {
        pricingSnapshot: snapshot({
          supplierKind: "hotel_property",
          routeId: "meal-plan-1",
          routeName: "Bed & Breakfast",
        }),
      },
      {
        pricingSnapshot: snapshot({
          supplierKind: "transfers",
          routeId: "route-transfer",
          routeName: "Airport ↔ Hotel",
        }),
      },
    ],
    { primarySupplierId: null },
  )

    expect(result).toEqual({ routeId: "route-transfer", routeName: "Airport ↔ Hotel", routeReversed: false })
  })

  it("prefers the known primary supplier's own leg over the train-then-first heuristic", () => {
    const result = resolvePrimaryRoute(
      [
        {
          pricingSnapshot: snapshot({
            supplierKind: "train_operator",
            supplierId: "sup-rovos",
            routeId: "route-rovos",
            routeName: "Pretoria ↔ Cape Town",
          }),
        },
        {
          pricingSnapshot: snapshot({
            supplierKind: "transfers",
            supplierId: "sup-transfer",
            routeId: "route-transfer",
            routeName: "Airport ↔ Shalati",
          }),
        },
      ],
      { primarySupplierId: "sup-transfer" },
    )
    expect(result).toEqual({ routeId: "route-transfer", routeName: "Airport ↔ Shalati", routeReversed: false })
  })

  it("returns nulls when the only routed leg is a hotel", () => {
    expect(
      resolvePrimaryRoute([
        {
          pricingSnapshot: snapshot({
            supplierKind: "hotel_property",
            routeId: "meal-plan-1",
            routeName: "Half Board",
          }),
        },
      ],
      { primarySupplierId: null },
    ),
    ).toEqual({ routeId: null, routeName: null, routeReversed: false })
  })
})

describe("resolvePrimarySupplierId", () => {
  it("prefers the train leg's supplier over other legs", () => {
    const result = resolvePrimarySupplierId([
      { pricingSnapshot: snapshot({ supplierKind: "transfers", supplierId: "sup-transfer" }) },
      { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-train" }) },
    ],
    { bookingPrimarySupplierId: null },
  )

    expect(result).toBe("sup-train")
  })

  it("falls back to the first non-hotel leg when no train leg exists", () => {
    const result = resolvePrimarySupplierId([
      { pricingSnapshot: null },
      { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-hotel" }) },
      { pricingSnapshot: snapshot({ supplierKind: "transfers", supplierId: "sup-transfer" }) },
    ],
    { bookingPrimarySupplierId: null },
  )

    expect(result).toBe("sup-transfer")
  })

  // A standalone stay (Kruger Shalati) prices nothing but hotel legs. Returning null there left
  // the quote with no supplier at all -- no rate audience, no journey class, no name on the
  // worksheet -- so a hotel wins when it is the only thing priced.
  it("returns the hotel for a hotel-only quote", () => {
    expect(
      resolvePrimarySupplierId([
        { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-hotel" }) },
      ],
      { bookingPrimarySupplierId: null },
    ),
    ).toBe("sup-hotel")
  })

  it("still passes a hotel over when any non-hotel leg is priced", () => {
    expect(
      resolvePrimarySupplierId([
        { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-hotel" }) },
        { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-train" }) },
      ],
      { bookingPrimarySupplierId: null },
    ),
    ).toBe("sup-train")
  })

  it("returns null for manual line items without snapshots", () => {
    expect(resolvePrimarySupplierId([{ pricingSnapshot: null }, {}], { bookingPrimarySupplierId: null })).toBeNull()
  })
})

describe("resolvePrimarySupplier — booking hint and standalone/ambiguity", () => {
  it("the booking's primary supplier wins when it is priced on the quote", () => {
    const result = resolvePrimarySupplier(
      [
        { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-rovos" }) },
        { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-shalati" }) },
      ],
      {
        bookingPrimarySupplierId: "sup-shalati",
        standaloneSupplierIds: new Set(["sup-rovos", "sup-shalati"]),
      },
    )
    expect(result).toEqual({ supplierId: "sup-shalati", source: "booking", candidateIds: ["sup-rovos", "sup-shalati"] })
  })

  it("ignores the booking hint when that supplier is not actually priced on this quote", () => {
    const result = resolvePrimarySupplier(
      [{ pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-rovos" }) }],
      { bookingPrimarySupplierId: "sup-shalati", standaloneSupplierIds: new Set(["sup-rovos", "sup-shalati"]) },
    )
    expect(result.supplierId).toBe("sup-rovos")
    expect(result.source).toBe("standalone")
  })

  it("a standalone hotel beats a later train leg when there is no booking hint", () => {
    const result = resolvePrimarySupplier(
      [
        { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-shalati" }) },
        { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-rovos" }) },
      ],
      { bookingPrimarySupplierId: null, standaloneSupplierIds: new Set(["sup-shalati"]) },
    )
    expect(result.supplierId).toBe("sup-shalati")
    expect(result.source).toBe("standalone")
  })

  it("two trains: the first by line-item order wins, and both are listed as candidates", () => {
    const result = resolvePrimarySupplier(
      [
        { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-bt" }) },
        { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-rovos" }) },
      ],
      { bookingPrimarySupplierId: null, standaloneSupplierIds: new Set(["sup-bt", "sup-rovos"]) },
    )
    expect(result.supplierId).toBe("sup-bt")
    expect(result.source).toBe("standalone")
    expect(result.candidateIds).toEqual(["sup-bt", "sup-rovos"])
  })

  it("falls back to the train rule when no standalone set is given (back-compat)", () => {
    const result = resolvePrimarySupplier([
      { pricingSnapshot: snapshot({ supplierKind: "transfers", supplierId: "sup-transfer" }) },
      { pricingSnapshot: snapshot({ supplierKind: "train_operator", supplierId: "sup-train" }) },
    ],
    { bookingPrimarySupplierId: null },
  )
    expect(result).toEqual({ supplierId: "sup-train", source: "train", candidateIds: [] })
  })

  it("reports source none for manual line items without snapshots", () => {
    expect(resolvePrimarySupplier([{ pricingSnapshot: null }, {}], { bookingPrimarySupplierId: null })).toEqual({
      supplierId: null,
      source: "none",
      candidateIds: [],
    })
  })
})

describe("syncBookingRoute", () => {
  const BOOKING_ID = "00000000-0000-4000-8000-00000000aaaa"

  function supabaseSpy() {
    const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    const supabase = { from: vi.fn(() => ({ update })) }
    return { supabase, update }
  }

  // The reported defect: a Kruger Shalati stay with a transfer extra wrote the transfer's route onto
  // bookings.route_id, because the booking's own primary supplier was never consulted and hotel legs
  // are excluded from route resolution. Rail was immune only because a train leg wins by default.
  it("writes the primary supplier's route, not whichever routed leg sorts first", async () => {
    const { supabase, update } = supabaseSpy()

    await syncBookingRoute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow spy, not a real client
      supabase as any,
      BOOKING_ID,
      [
        {
          pricingSnapshot: snapshot({
            supplierKind: "transfers",
            supplierId: "sup-ulysses",
            routeId: "route-transfer",
            routeName: "Airport ↔ Shalati",
          }),
        },
        {
          pricingSnapshot: snapshot({
            supplierKind: "train_operator",
            supplierId: "sup-rovos",
            routeId: "route-rovos",
            routeName: "Pretoria ↔ Cape Town",
          }),
        },
      ],
      "sup-rovos",
    )

    expect(update).toHaveBeenCalledWith({ route_id: "route-rovos", route_reversed: false })
  })

  // A hotel's "route" is a meal plan, not a journey, so a standalone stay resolves to no route at
  // all. Leaving the enquiry-time guess standing there is what let a stale route keep printing on
  // client documents.
  it("clears a stale enquiry route when a priced quote resolves to no journey", async () => {
    const { supabase, update } = supabaseSpy()

    await syncBookingRoute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow spy, not a real client
      supabase as any,
      BOOKING_ID,
      [
        {
          pricingSnapshot: snapshot({
            supplierKind: "hotel_property",
            supplierId: "sup-shalati",
            routeId: "meal-plan-bb",
            routeName: "Bed & Breakfast",
          }),
        },
      ],
      "sup-shalati",
    )

    expect(update).toHaveBeenCalledWith({ route_id: null, route_reversed: false })
  })

  // A purely manual quote knows nothing about the journey — it has nothing to correct, so it must
  // not wipe the route the enquiry established.
  it("leaves the booking alone when no line was priced by the engine", async () => {
    const { supabase, update } = supabaseSpy()

    await syncBookingRoute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow spy, not a real client
      supabase as any,
      BOOKING_ID,
      [{ pricingSnapshot: null }, {}],
      null,
    )

    expect(update).not.toHaveBeenCalled()
  })
})

/**
 * Characterization tests for the generalisation of the primary-product feature to every
 * SupplierKind. The hotel exclusions in this module become a `routeHasLocations` lookup, so the
 * behaviour that must survive that swap is pinned here first.
 */
describe("resolve-primary-route — behaviour frozen before the kind generalisation", () => {
  // Load-bearing. supplierKind is `SupplierKind | null`, and a routed snapshot that never recorded
  // one still contributes its route today. A naive `isJourneyRouteKind(kind)` swap returns false for
  // null and would silently drop these lines.
  it("includes a routed snapshot that carries no supplierKind at all", () => {
    const result = resolvePrimaryRoute(
      [
        {
          pricingSnapshot: snapshot({
            supplierKind: null,
            supplierId: "sup-unknown",
            routeId: "route-legacy",
            routeName: "Legacy Route",
          }),
        },
      ],
      { primarySupplierId: null },
    )

    expect(result).toEqual({ routeId: "route-legacy", routeName: "Legacy Route", routeReversed: false })
  })

  it("treats a kindless snapshot as eligible for the primary supplier too", () => {
    const result = resolvePrimarySupplier(
      [{ pricingSnapshot: snapshot({ supplierKind: null, supplierId: "sup-unknown" }) }],
      { bookingPrimarySupplierId: null },
    )

    expect(result.supplierId).toBe("sup-unknown")
    expect(result.source).toBe("first_leg")
  })

  /**
   * Deliberate delta to come: a tour operator's "route" is an itinerary, not a journey, so once the
   * exclusion keys off routeHasLocations the hotel wins this instead (source "hotel_fallback").
   * Only reachable from a caller that supplies no standaloneSupplierIds -- every production caller
   * goes through loadQuoteConfig, which always supplies them.
   */
  it("today: a tour leg beats a hotel leg when no standalone set is supplied", () => {
    const result = resolvePrimarySupplier(
      [
        { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-hotel" }) },
        { pricingSnapshot: snapshot({ supplierKind: "tour_operator", supplierId: "sup-tour" }) },
      ],
      { bookingPrimarySupplierId: null },
    )

    expect(result.supplierId).toBe("sup-tour")
    expect(result.source).toBe("first_leg")
  })

  /**
   * The Kruger Shalati regression, in two halves.
   *
   * The naming half is fixed: the booking's own primary supplier wins, so the quote email opens
   * with the property rather than "your most valued Ulysses Tours & Transfers enquiry".
   *
   * The route half is NOT. resolvePrimaryRoute strips hotel legs before it looks for the primary
   * supplier's own snapshot, so on a standalone stay the primary is never found among the
   * candidates and the ladder falls through to the transfer's leg -- syncBookingRoute then writes
   * "Airport <-> Shalati" onto bookings.route_id as though it were the journey. The module's own
   * docstring claims this resolves to no route at all, which only holds while nothing but hotel
   * legs are priced.
   *
   * Recorded here as it actually behaves today. Phase 2 makes a known primary supplier with no
   * journey-shaped route of its own resolve to no route instead of borrowing another supplier's,
   * and updates the second half of this test in the same commit.
   */
  it("a hotel-primary booking with a transfer extra keeps the hotel, but today still borrows the transfer's route", () => {
    const lineItems = [
      { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-shalati", routeId: "meal-plan-1", routeName: "Full Board" }) },
      { pricingSnapshot: snapshot({ supplierKind: "transfers", supplierId: "sup-ulysses", routeId: "route-transfer", routeName: "Airport ↔ Shalati" }) },
    ]

    const supplier = resolvePrimarySupplier(lineItems, {
      bookingPrimarySupplierId: "sup-shalati",
      standaloneSupplierIds: new Set(["sup-shalati"]),
    })
    expect(supplier.supplierId).toBe("sup-shalati")
    expect(supplier.source).toBe("booking")

    expect(resolvePrimaryRoute(lineItems, { primarySupplierId: supplier.supplierId })).toEqual({
      routeId: "route-transfer",
      routeName: "Airport ↔ Shalati",
      routeReversed: false,
    })
  })

  // An airline primary is one of the kinds this work unlocks. Its route is a genuine origin ->
  // destination, so it must keep resolving once the hotel-specific exclusion is generalised.
  it("an airline leg's route resolves as a journey", () => {
    const result = resolvePrimaryRoute(
      [
        {
          pricingSnapshot: snapshot({
            supplierKind: "airline",
            supplierId: "sup-airline",
            routeId: "route-air",
            routeName: "Johannesburg → Nairobi",
          }),
        },
      ],
      { primarySupplierId: "sup-airline" },
    )

    expect(result).toEqual({ routeId: "route-air", routeName: "Johannesburg → Nairobi", routeReversed: false })
  })
})
