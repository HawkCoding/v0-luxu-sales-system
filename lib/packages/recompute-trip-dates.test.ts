import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { recomputeBookingTripDates } from "./recompute-trip-dates"

describe("recomputeBookingTripDates", () => {
  it("syncs departure_date to the derived start when the legs carry dates", async () => {
    const { supabase, store } = createSupabaseMock({
      bookings: [
        {
          id: "b1",
          package_id: "pkg-1",
          departure_date: "2026-09-20",
          trip_start_date: "2026-09-20",
          trip_end_date: "2026-09-20",
          package_travel_date: "2026-09-20",
        },
      ],
      booking_package_selections: [],
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
          package_id: "pkg-1",
          departure_date: "2026-09-20",
          trip_start_date: "2026-09-20",
        },
      ],
      booking_package_selections: [],
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
      bookings: [{ id: "b1", package_id: null, departure_date: "2026-09-20", trip_start_date: "2026-09-20" }],
      booking_transport_requests: [],
    })

    const { error } = await recomputeBookingTripDates(supabase as never, "b1")

    expect(error).toBeNull()
    expect(store.rows("bookings")[0]).toMatchObject({
      departure_date: "2026-09-20",
      trip_start_date: "2026-09-20",
    })
  })
})
