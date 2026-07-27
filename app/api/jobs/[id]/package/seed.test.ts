import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { seedUnitsForServices, type SeedLeg } from "@/app/api/jobs/[id]/package/seed"

const BOOKING_ID = "booking-1"

function baseSeed() {
  return {
    booking_suites: [
      {
        id: "suite-row-1",
        booking_id: BOOKING_ID,
        suite_number: 1,
        suite_type_id: "suite-type-train",
        bedroom_type_id: "bedroom-double",
        bedroom_layout_id: null,
        bathroom_type_id: "bathroom-shower",
        source_phrase: "deluxe suite with shower",
      },
      {
        id: "suite-row-2",
        booking_id: BOOKING_ID,
        suite_number: 2,
        // Unresolved -- must never seed a unit for this.
        suite_type_id: null,
        bedroom_type_id: null,
        bedroom_layout_id: null,
        bathroom_type_id: null,
        source_phrase: "something we couldn't identify",
      },
    ],
    suite_types: [{ id: "suite-type-train", supplier_id: "supplier-train" }],
  }
}

describe("seedUnitsForServices", () => {
  it("does nothing for an empty service list", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const result = await seedUnitsForServices(supabase as never, BOOKING_ID, [], {
      tripStartDate: null,
      tripEndDate: null,
    })
    expect(result.error).toBeNull()
    expect(store.rows("booking_service_units")).toHaveLength(0)
  })

  it("carries a captured suite's type + full config across to the matching supplier's service", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const services: SeedLeg[] = [{ id: "svc-train", supplier_id: "supplier-train", kind: "train_operator" }]

    const result = await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: "2026-09-01",
      tripEndDate: "2026-09-05",
    })

    expect(result.error).toBeNull()
    const units = store.rows("booking_service_units")
    expect(units).toHaveLength(1)
    expect(units[0]).toMatchObject({
      service_id: "svc-train",
      suite_type_id: "suite-type-train",
      bedroom_type_id: "bedroom-double",
      bathroom_type_id: "bathroom-shower",
      origin: "consultant",
    })
  })

  it("seeds a blank placeholder unit when the supplier has no captured suite", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const services: SeedLeg[] = [{ id: "svc-hotel", supplier_id: "supplier-hotel", kind: "hotel_property" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    const units = store.rows("booking_service_units")
    expect(units).toHaveLength(1)
    expect(units[0]).toMatchObject({ service_id: "svc-hotel", sort_order: 0 })
    expect(units[0].suite_type_id).toBeUndefined()
  })

  it("never invents a unit for a suite whose type is still unresolved", async () => {
    const { supabase, store } = createSupabaseMock({
      booking_suites: [
        {
          id: "suite-row-1",
          booking_id: BOOKING_ID,
          suite_number: 1,
          suite_type_id: null,
          bedroom_type_id: null,
          bedroom_layout_id: null,
          bathroom_type_id: null,
        },
      ],
      suite_types: [],
    })
    const services: SeedLeg[] = [{ id: "svc-train", supplier_id: "supplier-train", kind: "train_operator" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    // No captured suite resolves to this supplier, so a blank placeholder unit is seeded --
    // not a unit carrying the unresolved suite's (null) type.
    const units = store.rows("booking_service_units")
    expect(units).toHaveLength(1)
    expect(units[0].suite_type_id).toBeUndefined()
  })

  it("marks seeded units with the given origin", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const services: SeedLeg[] = [{ id: "svc-train", supplier_id: "supplier-train", kind: "train_operator" }]

    await seedUnitsForServices(
      supabase as never,
      BOOKING_ID,
      services,
      { tripStartDate: null, tripEndDate: null },
      "auto",
    )

    expect(store.rows("booking_service_units")[0]).toMatchObject({ origin: "auto" })
  })

  it("creates a blank transport request (+ rental details for a rental) for transport-kind services", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const services: SeedLeg[] = [
      { id: "svc-transfer", supplier_id: "supplier-transfer", kind: "transfers" },
      { id: "svc-rental", supplier_id: "supplier-rental", kind: "vehicle_rental" },
    ]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: "2026-09-01",
      tripEndDate: "2026-09-05",
    })

    // Transport services never get booking_service_units -- they're priced via
    // booking_transport_requests instead.
    expect(store.rows("booking_service_units")).toHaveLength(0)

    const transportRows = store.rows("booking_transport_requests")
    expect(transportRows).toHaveLength(2)
    const transfer = transportRows.find((row) => row.service_id === "svc-transfer")
    const rental = transportRows.find((row) => row.service_id === "svc-rental")
    expect(transfer).toMatchObject({ service_type: "transfer", pickup_at: "2026-09-01T00:00:00+00:00" })
    expect(rental).toMatchObject({ service_type: "rental" })

    const rentalDetails = store.rows("booking_vehicle_rental_details")
    expect(rentalDetails).toHaveLength(1)
    expect(rentalDetails[0]).toMatchObject({ return_at: "2026-09-05T00:00:00+00:00" })
  })
})
