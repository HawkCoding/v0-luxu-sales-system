import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { recomputeBookingTripDates } from "./recompute-trip-dates"

describe("recomputeBookingTripDates", () => {
  it("syncs departure_date to the derived start when the legs carry dates", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [
        {
          id: "b1",
          departure_date: "2026-09-20",
          trip_start_date: "2026-09-20",
          trip_end_date: "2026-09-20",
          package_travel_date: "2026-09-20",
        },
      ],
      booking_transport_requests: [
        { id: "t1", booking_id: "b1", pickup_at: "2026-09-25T09:00:00.000Z" },
      ],
    })

    const { error } = await recomputeBookingTripDates(supabase as never, "b1")

    expect(error).toBeNull()
    expect(store.rows("bookings")[0]).toMatchObject({
      departure_date: "2026-09-25",
      trip_start_date: "2026-09-25",
      package_travel_date: "2026-09-25",
    })
  })

  it("keeps the enquiry-time departure_date when no leg is dated (start is null)", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [
        {
          id: "b1",
          departure_date: "2026-09-20",
          trip_start_date: "2026-09-20",
        },
      ],
      // The booking has a service, so trip dates ARE derivable from it -- an undated service
      // clears them. Contrast with the next test, where a booking with no services at all is
      // left untouched.
      booking_services: [
        { id: "s1", booking_id: "b1", selected: true, service_date: null, nights: null, route_id: null },
      ],
      booking_transport_requests: [],
    })

    const { error } = await recomputeBookingTripDates(supabase as never, "b1")

    expect(error).toBeNull()
    // trip_* clear to null, but the known enquiry departure is preserved.
    expect(store.rows("bookings")[0]).toMatchObject({
      departure_date: "2026-09-20",
      trip_start_date: null,
    })
  })

  it("leaves a non-package booking untouched when nothing is dated", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [{ id: "b1", departure_date: "2026-09-20", trip_start_date: "2026-09-20" }],
      booking_transport_requests: [],
    })

    const { error } = await recomputeBookingTripDates(supabase as never, "b1")

    expect(error).toBeNull()
    expect(store.rows("bookings")[0]).toMatchObject({
      departure_date: "2026-09-20",
      trip_start_date: "2026-09-20",
    })
  })

  it("anchors departure_date to the primary product's own leg, not an earlier ancillary transfer (F-P3-4)", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [
        {
          id: "b1",
          primary_supplier_id: "supplier-tour",
          departure_date: "2026-11-20",
          trip_start_date: "2026-11-20",
          trip_end_date: "2026-11-20",
        },
      ],
      booking_services: [
        {
          id: "s1",
          booking_id: "b1",
          selected: true,
          supplier_id: "supplier-tour",
          service_date: "2026-11-20",
          nights: 3,
          route_id: null,
          arrival_date: null,
          suppliers: { kind: "tour_operator" },
        },
      ],
      booking_transport_requests: [
        // A pre-arrival transfer that runs three days before the tour starts.
        { id: "t1", booking_id: "b1", pickup_at: "2026-11-17T09:00:00.000Z" },
      ],
    })

    const { error } = await recomputeBookingTripDates(supabase as never, "b1")

    expect(error).toBeNull()
    expect(store.rows("bookings")[0]).toMatchObject({
      // The tour's own start, not the transfer's.
      departure_date: "2026-11-20",
      // The full trip window still spans every dated leg -- the worksheet's ARRIVE/DEPART want it.
      trip_start_date: "2026-11-17",
      trip_end_date: "2026-11-23",
    })
  })

  it("falls back to the earliest dated leg when the booking has no primary supplier", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [{ id: "b1", primary_supplier_id: null, departure_date: "2026-09-20" }],
      booking_services: [
        {
          id: "s1",
          booking_id: "b1",
          selected: true,
          supplier_id: "supplier-train",
          service_date: "2026-09-25",
          nights: null,
          route_id: null,
          arrival_date: null,
          suppliers: { kind: "train_operator" },
        },
      ],
      booking_transport_requests: [
        { id: "t1", booking_id: "b1", pickup_at: "2026-09-23T09:00:00.000Z" },
      ],
    })

    const { error } = await recomputeBookingTripDates(supabase as never, "b1")

    expect(error).toBeNull()
    // No primary supplier recorded -- falls back to the old train-only rule (isCoreBookingLeg),
    // so the train still anchors departure_date even though the transfer runs earlier.
    expect(store.rows("bookings")[0]).toMatchObject({ departure_date: "2026-09-25" })
  })
})
