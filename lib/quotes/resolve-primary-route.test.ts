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
