import { describe, expect, it, vi } from "vitest"
import { loadQuoteConfig, overridesFromQuoteRow } from "./load-quote-config"
import type { PricingSnapshot } from "@/lib/types"

/**
 * Characterization tests for the booking hint that keeps a standalone booking's own supplier at the
 * head of its quote.
 *
 * Every client-facing document resolves its primary supplier through here, and the Kruger Shalati
 * regression was caused by a caller reaching the resolver without the booking's
 * primary_supplier_id: a stay with a transfer extra then named the transfer company. The two
 * behaviours that prevent it -- reading the id from bookingId, and treating an explicit null as
 * "not supplied yet" rather than "there is none" -- are pinned here before the primary-product
 * feature is generalised to every SupplierKind.
 */

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
    routeId: null,
    routeName: null,
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

interface StubOptions {
  suppliers?: { id: string; name: string; long_journey_min_days: number | null; sells_standalone: boolean }[]
  bookingPrimarySupplierId?: string | null
}

/** Minimal Supabase stub covering only the tables loadQuoteConfig touches. */
function supabaseStub(options: StubOptions = {}) {
  const bookingSelect = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === "suppliers") {
      return { select: () => ({ in: () => Promise.resolve({ data: options.suppliers ?? [], error: null }) }) }
    }
    if (table === "bookings") {
      bookingSelect()
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { primary_supplier_id: options.bookingPrimarySupplierId ?? null },
                error: null,
              }),
          }),
        }),
      }
    }
    // routes / rate_types — never reached by these fixtures, but kept honest.
    return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }
  })

  return { supabase: { from }, from, bookingSelect }
}

const SHALATI = {
  id: "sup-shalati",
  name: "Kruger Shalati - Train on the Bridge",
  long_journey_min_days: null,
  sells_standalone: true,
}
const ULYSSES = {
  id: "sup-ulysses",
  name: "Ulysses Tours & Transfers",
  long_journey_min_days: null,
  sells_standalone: false,
}

const STAY_WITH_TRANSFER = [
  { pricingSnapshot: snapshot({ supplierKind: "hotel_property", supplierId: "sup-shalati" }) },
  { pricingSnapshot: snapshot({ supplierKind: "transfers", supplierId: "sup-ulysses" }) },
]

describe("loadQuoteConfig — the booking hint", () => {
  it("reads primary_supplier_id from bookingId when the caller has not resolved it", async () => {
    const { supabase, bookingSelect } = supabaseStub({
      suppliers: [SHALATI, ULYSSES],
      bookingPrimarySupplierId: "sup-shalati",
    })

    const config = await loadQuoteConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      { lineItems: STAY_WITH_TRANSFER, bookingId: "booking-1" },
    )

    expect(bookingSelect).toHaveBeenCalled()
    expect(config.primarySupplierId).toBe("sup-shalati")
    expect(config.primarySupplierSource).toBe("booking")
  })

  /**
   * Load-bearing `== null`. Three callers pass `booking?.primary_supplier_id ?? null`, so a booking
   * they could not load arrives as an explicit null. Reading that as "there is none" is exactly what
   * let the transfer company win the quote.
   */
  it("still queries when bookingPrimarySupplierId arrives as an explicit null", async () => {
    const { supabase, bookingSelect } = supabaseStub({
      suppliers: [SHALATI, ULYSSES],
      bookingPrimarySupplierId: "sup-shalati",
    })

    const config = await loadQuoteConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      { lineItems: STAY_WITH_TRANSFER, bookingId: "booking-1", bookingPrimarySupplierId: null },
    )

    expect(bookingSelect).toHaveBeenCalled()
    expect(config.primarySupplierId).toBe("sup-shalati")
  })

  it("skips the query when the caller already holds the id", async () => {
    const { supabase, bookingSelect } = supabaseStub({ suppliers: [SHALATI, ULYSSES] })

    const config = await loadQuoteConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      { lineItems: STAY_WITH_TRANSFER, bookingId: "booking-1", bookingPrimarySupplierId: "sup-shalati" },
    )

    expect(bookingSelect).not.toHaveBeenCalled()
    expect(config.primarySupplierId).toBe("sup-shalati")
  })

  /**
   * The failure mode itself, reproduced. With no booking to ask, the standalone flag is the only
   * thing keeping the transfer company off the front of the email — which is why every production
   * caller passes a bookingId.
   */
  it("falls back to the standalone supplier when no booking is supplied", async () => {
    const { supabase, bookingSelect } = supabaseStub({ suppliers: [SHALATI, ULYSSES] })

    const config = await loadQuoteConfig(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- narrow stub, not a real client
      supabase as any,
      { lineItems: STAY_WITH_TRANSFER },
    )

    expect(bookingSelect).not.toHaveBeenCalled()
    expect(config.primarySupplierId).toBe("sup-shalati")
    expect(config.primarySupplierSource).toBe("standalone")
  })
})

describe("overridesFromQuoteRow", () => {
  it("passes through valid stored overrides", () => {
    expect(
      overridesFromQuoteRow({ journey_class: "long", rate_audience: "resident", show_train_only_note: true }),
    ).toEqual({ journeyClass: "long", rateAudience: "resident", showTrainOnlyNote: true })
  })

  it("discards values outside the known sets", () => {
    expect(
      overridesFromQuoteRow({ journey_class: "medium", rate_audience: "martian", show_train_only_note: null }),
    ).toEqual({ journeyClass: null, rateAudience: null, showTrainOnlyNote: null })
  })

  it("returns neutral overrides for a missing row", () => {
    expect(overridesFromQuoteRow(null)).toEqual({
      journeyClass: null,
      rateAudience: null,
      showTrainOnlyNote: null,
    })
  })
})
