import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { autoBuildBookingServices, type AutoBuildInput } from "@/lib/auto-build/build-from-enquiry"

const BOOKING_ID = "booking-1"
const TRAIN_SUPPLIER_ID = "supplier-train"
const HOTEL_SUPPLIER_ID = "supplier-hotel"
const ROUTE_ID = "route-1"

function baseInput(overrides: Partial<AutoBuildInput> = {}): AutoBuildInput {
  return {
    bookingId: BOOKING_ID,
    trainSupplierId: TRAIN_SUPPLIER_ID,
    hotelSupplierId: null,
    routeId: null,
    departureDate: "2026-09-01",
    ...overrides,
  }
}

function baseSeed(overrides: Record<string, unknown[]> = {}) {
  return {
    booking_services: [],
    suppliers: [
      { id: TRAIN_SUPPLIER_ID, kind: "train_operator" },
      { id: HOTEL_SUPPLIER_ID, kind: "hotel_property" },
    ],
    booking_suites: [],
    suite_types: [],
    booking_service_units: [],
    ...overrides,
  }
}

describe("autoBuildBookingServices", () => {
  it("builds nothing when no train supplier resolved", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const result = await autoBuildBookingServices(supabase as never, baseInput({ trainSupplierId: null }))

    expect(result).toEqual({
      servicesCreated: 0,
      unitsCreated: 0,
      skipped: ["No train operator resolved — nothing built"],
    })
    expect(store.rows("booking_services")).toHaveLength(0)
  })

  it("is idempotent: a booking that already has services is left untouched", async () => {
    const { supabase, store } = createSupabaseMock(
      baseSeed({ booking_services: [{ id: "existing-1", booking_id: BOOKING_ID }] }),
    )
    const result = await autoBuildBookingServices(supabase as never, baseInput())

    expect(result.servicesCreated).toBe(0)
    expect(result.skipped).toEqual(["Booking already has services — left untouched"])
    // Only the pre-existing row -- nothing new was inserted.
    expect(store.rows("booking_services")).toHaveLength(1)
  })

  it("creates a selected rail service and an unselected hotel service, with route_id only on the rail leg", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const result = await autoBuildBookingServices(
      supabase as never,
      baseInput({ hotelSupplierId: HOTEL_SUPPLIER_ID, routeId: ROUTE_ID }),
    )

    expect(result.servicesCreated).toBe(2)
    const services = store.rows("booking_services")
    expect(services).toHaveLength(2)

    const rail = services.find((s) => s.supplier_id === TRAIN_SUPPLIER_ID)
    const hotel = services.find((s) => s.supplier_id === HOTEL_SUPPLIER_ID)
    expect(rail).toMatchObject({ selected: true, route_id: ROUTE_ID, origin: "auto", service_date: "2026-09-01" })
    expect(hotel).toMatchObject({ selected: false, route_id: null, origin: "auto" })
  })

  it("builds only the rail service when no hotel was resolved", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const result = await autoBuildBookingServices(supabase as never, baseInput())

    expect(result.servicesCreated).toBe(1)
    expect(store.rows("booking_services")).toHaveLength(1)
    expect(store.rows("booking_services")[0]).toMatchObject({ supplier_id: TRAIN_SUPPLIER_ID, selected: true })
  })

  it("skips a resolved supplier id that no longer matches an active supplier, without failing the whole build", async () => {
    const { supabase, store } = createSupabaseMock(
      baseSeed({ suppliers: [{ id: TRAIN_SUPPLIER_ID, kind: "train_operator" }] }),
    )
    const result = await autoBuildBookingServices(
      supabase as never,
      baseInput({ hotelSupplierId: "supplier-deleted" }),
    )

    expect(result.servicesCreated).toBe(1)
    expect(result.skipped).toContain("Resolved hotel supplier id no longer matches an active supplier")
    expect(store.rows("booking_services")).toHaveLength(1)
  })

  it("carries a captured suite's resolved type across via seedUnitsForServices", async () => {
    const { supabase, store } = createSupabaseMock(
      baseSeed({
        booking_suites: [
          {
            id: "suite-row-1",
            booking_id: BOOKING_ID,
            suite_number: 1,
            suite_type_id: "suite-type-1",
            bedroom_type_id: null,
            bedroom_layout_id: null,
            bathroom_type_id: null,
          },
        ],
        suite_types: [{ id: "suite-type-1", supplier_id: TRAIN_SUPPLIER_ID }],
      }),
    )
    const result = await autoBuildBookingServices(supabase as never, baseInput())

    expect(result.unitsCreated).toBe(1)
    const units = store.rows("booking_service_units")
    expect(units).toHaveLength(1)
    expect(units[0]).toMatchObject({ suite_type_id: "suite-type-1", origin: "auto" })
  })

  it("returns servicesCreated: 0 and a skip reason when the only resolved supplier id is stale", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed({ suppliers: [] }))
    const result = await autoBuildBookingServices(supabase as never, baseInput())

    expect(result.servicesCreated).toBe(0)
    expect(result.skipped).toContain("Resolved train supplier id no longer matches an active supplier")
    expect(store.rows("booking_services")).toHaveLength(0)
  })
})
