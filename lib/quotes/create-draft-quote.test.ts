import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"

const adapterMocks = vi.hoisted(() => ({
  loadBookingServicesPackageDetail: vi.fn(),
}))

vi.mock("@/lib/quotes/adapters/from-booking-services", () => ({
  loadBookingServicesPackageDetail: adapterMocks.loadBookingServicesPackageDetail,
  bookingServicesToLegSelections: vi.fn(() => [{ legId: "svc-1" }]),
}))

const buildMocks = vi.hoisted(() => ({
  buildPackageQuoteLineItems: vi.fn(),
}))

vi.mock("@/lib/quotes/build-from-package", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quotes/build-from-package")>()
  return { ...actual, buildPackageQuoteLineItems: buildMocks.buildPackageQuoteLineItems }
})

import { createDraftQuoteForBooking } from "@/lib/quotes/create-draft-quote"
import { DEFAULT_QUOTE_VALIDITY_DAYS, isoDateDaysFromNow } from "@/lib/quotes/quote-validity"

const BOOKING_ID = "booking-1"

describe("createDraftQuoteForBooking", () => {
  beforeEach(() => {
    adapterMocks.loadBookingServicesPackageDetail.mockReset()
    buildMocks.buildPackageQuoteLineItems.mockReset()
  })

  it("warns when nothing was auto-built", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [] },
      services: [],
      units: [],
    })
    const { supabase, store } = createSupabaseMock()

    const result = await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(result.warning).toMatch(/No services were auto-built/)
    expect(result.quoteId).toBeTruthy()
    expect(store.rows("quotes")[0]).toMatchObject({ status: "pricing_incomplete" })
    expect(buildMocks.buildPackageQuoteLineItems).not.toHaveBeenCalled()
  })

  it("prices and saves line items when services were built", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }] },
      services: [{ id: "svc-1" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({
      lineItems: [{ description: "Blue Train - Adult", qty: 2, unitPrice: 1000, total: 2000 }],
    })
    const { supabase, store } = createSupabaseMock()

    const result = await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(result.warning).toBeNull()
    expect(store.rows("quotes")[0]).toMatchObject({ status: "draft", total: 2000 })
    expect(store.rows("quote_line_items")).toHaveLength(1)
  })

  it("prices with the default commission from settings", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }] },
      services: [{ id: "svc-1" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({ lineItems: [] })
    const { supabase } = createSupabaseMock({
      app_settings: [
        { key: "default_commission_type", value: "percent" },
        { key: "default_commission_value", value: "10" },
      ],
      rate_types: [{ id: "rt-default", code: "RAC", name: "Rack Rate", is_default: true }],
    })

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(buildMocks.buildPackageQuoteLineItems).toHaveBeenCalledWith(
      expect.objectContaining({
        selections: [{ legId: "svc-1", commissionOverride: { type: "percent", value: 10 } }],
        fallbackRateTypeId: "rt-default",
      }),
    )
  })

  it("leaves the commission off entirely when the default is zero", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }] },
      services: [{ id: "svc-1" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({ lineItems: [] })
    const { supabase } = createSupabaseMock({
      app_settings: [
        { key: "default_commission_type", value: "percent" },
        { key: "default_commission_value", value: "0" },
      ],
    })

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(buildMocks.buildPackageQuoteLineItems).toHaveBeenCalledWith(
      expect.objectContaining({ selections: [{ legId: "svc-1" }] }),
    )
  })

  it("stamps validity_until from the configured quote_validity_days", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [] },
      services: [],
      units: [],
    })
    const { supabase, store } = createSupabaseMock({
      app_settings: [{ key: "quote_validity_days", value: "7" }],
    })

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(store.rows("quotes")[0]).toMatchObject({
      validity_until: isoDateDaysFromNow(7),
    })
  })

  it("falls back to the 14-day default when the setting row is absent", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [] },
      services: [],
      units: [],
    })
    const { supabase, store } = createSupabaseMock()

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(store.rows("quotes")[0]).toMatchObject({
      validity_until: isoDateDaysFromNow(DEFAULT_QUOTE_VALIDITY_DAYS),
    })
  })

  it("still creates the quote and surfaces the engine's error as a warning when pricing throws", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }] },
      services: [{ id: "svc-1" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockRejectedValue(new Error("No suite type selected for leg: Blue Train"))
    const { supabase, store } = createSupabaseMock()

    const result = await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(result.warning).toBe("No suite type selected for leg: Blue Train")
    expect(result.quoteId).toBeTruthy()
    expect(store.rows("quotes")[0]).toMatchObject({ status: "pricing_incomplete" })
  })
})
