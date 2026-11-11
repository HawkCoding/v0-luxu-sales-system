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
      incompleteLegs: [],
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

  it("leaves a quote as draft when a line is at R0 — a flight can be free", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }, { id: "svc-2" }] },
      services: [{ id: "svc-1" }, { id: "svc-2" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({
      lineItems: [
        { description: "Blue Train - Adult", qty: 2, unitPrice: 1000, total: 2000 },
        { description: "Flight JNB-CPT", qty: 2, unitPrice: 0, total: 0 },
      ],
      incompleteLegs: [],
    })
    const { supabase, store } = createSupabaseMock()

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(store.rows("quotes")[0]).toMatchObject({ status: "draft", total: 2000 })
  })

  it("prices with the default commission from settings", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }] },
      services: [{ id: "svc-1" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({ lineItems: [], incompleteLegs: [] })
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
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({ lineItems: [], incompleteLegs: [] })
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

  it("keeps a quote pricing_incomplete when a leg was skipped for missing configuration (F10-8)", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }, { id: "svc-2" }] },
      services: [{ id: "svc-1" }, { id: "svc-2" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({
      lineItems: [{ description: "Blue Train - Adult", qty: 2, unitPrice: 1000, total: 2000 }],
      incompleteLegs: [
        { legId: "svc-2", legLabel: "Ulysses Transfers", message: "No route selected for leg: Ulysses Transfers" },
      ],
    })
    const { supabase, store } = createSupabaseMock()

    const result = await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(store.rows("quotes")[0]).toMatchObject({ status: "pricing_incomplete" })
    expect(result.warning).toMatch(/No route selected for leg: Ulysses Transfers/)
    // The lines that did price are still saved -- the quote is partial, not empty.
    expect(store.rows("quote_line_items")).toHaveLength(1)
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

  it("names the booking's pax groups off the primary service's units and hands them to the engine", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: {
        id: BOOKING_ID,
        legs: [
          {
            id: "svc-hotel",
            supplierId: "sup-hotel",
            supplierKind: "hotel_property",
            sortOrder: 1,
            suiteTypes: [{ id: "room-ocean", name: "Ocean View Room" }],
          },
          {
            id: "svc-train",
            supplierId: "sup-train",
            supplierKind: "train_operator",
            sortOrder: 0,
            suiteTypes: [
              { id: "suite-dlx", name: "Deluxe Suite", bedroomTypeIds: ["bed-twin"], bedroomTypes: ["Twin"] },
            ],
          },
        ],
      },
      services: [{ id: "svc-train" }, { id: "svc-hotel" }],
      units: [
        { id: "u-hotel", service_id: "svc-hotel", sort_order: 0, suite_type_id: "room-ocean", bedroom_type_id: null, pax_group_ids: ["g2"] },
        { id: "u2", service_id: "svc-train", sort_order: 1, suite_type_id: "suite-dlx", bedroom_type_id: null, pax_group_ids: ["g2"] },
        { id: "u1", service_id: "svc-train", sort_order: 0, suite_type_id: "suite-dlx", bedroom_type_id: "bed-twin", pax_group_ids: ["g1"] },
        { id: "u3", service_id: "svc-train", sort_order: 2, suite_type_id: "suite-dlx", bedroom_type_id: null, pax_group_ids: ["g3"] },
      ],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({ lineItems: [], incompleteLegs: [] })
    const { supabase } = createSupabaseMock({
      bookings: [{ id: BOOKING_ID, primary_supplier_id: "sup-train" }],
      booking_pax_groups: [
        { id: "g3", booking_id: BOOKING_ID, position: 3, label: "Grandparents" },
        { id: "g1", booking_id: BOOKING_ID, position: 1, label: null },
        { id: "g2", booking_id: BOOKING_ID, position: 2, label: null },
        { id: "g-other", booking_id: "another-booking", position: 1, label: "Not ours" },
      ],
    })

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(buildMocks.buildPackageQuoteLineItems).toHaveBeenCalledWith(
      expect.objectContaining({
        paxGroups: [
          { id: "g1", position: 1, label: "Twin Deluxe Suite 1" },
          { id: "g2", position: 2, label: "Deluxe Suite 2" },
          { id: "g3", position: 3, label: "Grandparents" },
        ],
      }),
    )
  })

  it("hands the engine no pax groups for a booking with a single group or none", async () => {
    adapterMocks.loadBookingServicesPackageDetail.mockResolvedValue({
      detail: { id: BOOKING_ID, legs: [{ id: "svc-1" }] },
      services: [{ id: "svc-1" }],
      units: [],
    })
    buildMocks.buildPackageQuoteLineItems.mockResolvedValue({ lineItems: [], incompleteLegs: [] })
    const { supabase } = createSupabaseMock({
      booking_pax_groups: [{ id: "g1", booking_id: BOOKING_ID, position: 1, label: null }],
    })

    await createDraftQuoteForBooking({
      supabase: supabase as never,
      bookingId: BOOKING_ID,
      bookingNumber: "BT-2026-0001",
      travelDate: "2026-09-01",
    })

    expect(buildMocks.buildPackageQuoteLineItems).toHaveBeenCalledWith(expect.objectContaining({ paxGroups: [] }))
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
