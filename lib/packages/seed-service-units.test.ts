import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { seedUnitsForServices, type SeedLeg } from "@/lib/packages/seed-service-units"

const BOOKING_ID = "booking-1"

interface BaseSeedBookingSuite {
  [key: string]: unknown
  id: string
  booking_id: string
  suite_number: number
  suite_type_id: string | null
  bedroom_type_id: string | null
  bedroom_layout_id: string | null
  bathroom_type_id: string | null
  source_phrase: string
}

function baseSeed() {
  return {
    bookings: [{ id: BOOKING_ID, no_of_adults: 2, no_of_children: 0, child_ages: null as number[] | null }],
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
    ] as BaseSeedBookingSuite[],
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

  it("carries the enquiry's headcount onto the seeded unit", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const services: SeedLeg[] = [{ id: "svc-train", supplier_id: "supplier-train", kind: "train_operator" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    expect(store.rows("booking_service_units")[0]).toMatchObject({
      adult_count: 2,
      child_count: 0,
      infant_count: 0,
    })
  })

  it("spreads the headcount evenly across a supplier's captured suites", async () => {
    const seed = baseSeed()
    seed.bookings = [{ id: BOOKING_ID, no_of_adults: 3, no_of_children: 0, child_ages: null }]
    seed.booking_suites[1] = {
      ...seed.booking_suites[1],
      suite_type_id: "suite-type-train",
      bedroom_type_id: null,
      bathroom_type_id: null,
    }
    const { supabase, store } = createSupabaseMock(seed)
    const services: SeedLeg[] = [{ id: "svc-train", supplier_id: "supplier-train", kind: "train_operator" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    const units = store.rows("booking_service_units").sort(
      (a, b) => (a.sort_order as number) - (b.sort_order as number),
    )
    expect(units).toHaveLength(2)
    // Remainder lands on the earlier suite, and the split still sums to the booking total.
    expect(units.map((unit) => unit.adult_count)).toEqual([2, 1])
  })

  it("gives every tour unit the full headcount instead of splitting it across them", async () => {
    // Same shape as "spreads the headcount evenly" above, but for a tour operator -- two tour
    // types captured from the enquiry are two different activities the same 3 travellers do,
    // not 3 people split across them, so each unit must carry the whole headcount.
    const seed = baseSeed()
    seed.bookings = [{ id: BOOKING_ID, no_of_adults: 3, no_of_children: 0, child_ages: null }]
    seed.booking_suites[0] = { ...seed.booking_suites[0], suite_type_id: "suite-type-tour" }
    seed.booking_suites[1] = {
      ...seed.booking_suites[1],
      suite_type_id: "suite-type-tour",
      bedroom_type_id: null,
      bathroom_type_id: null,
    }
    seed.suite_types = [{ id: "suite-type-tour", supplier_id: "supplier-tour" }]
    const { supabase, store } = createSupabaseMock(seed)
    const services: SeedLeg[] = [{ id: "svc-tour", supplier_id: "supplier-tour", kind: "tour_operator" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    const units = store.rows("booking_service_units").sort(
      (a, b) => (a.sort_order as number) - (b.sort_order as number),
    )
    expect(units).toHaveLength(2)
    expect(units.map((unit) => unit.adult_count)).toEqual([3, 3])
  })

  it("buckets children by age so the split matches what the pricing engine expects", async () => {
    const seed = baseSeed()
    seed.bookings = [{ id: BOOKING_ID, no_of_adults: 2, no_of_children: 2, child_ages: [1, 8] }]
    const { supabase, store } = createSupabaseMock(seed)
    const services: SeedLeg[] = [{ id: "svc-train", supplier_id: "supplier-train", kind: "train_operator" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    // Default buckets: infant <= 2, child <= 12 -- so the 1-year-old is an infant, the 8-year-old a child.
    expect(store.rows("booking_service_units")[0]).toMatchObject({
      adult_count: 2,
      child_count: 1,
      infant_count: 1,
    })
  })

  it("gives a placeholder unit the whole headcount so it prices once a suite type is chosen", async () => {
    const { supabase, store } = createSupabaseMock(baseSeed())
    const services: SeedLeg[] = [{ id: "svc-hotel", supplier_id: "supplier-hotel", kind: "hotel_property" }]

    await seedUnitsForServices(supabase as never, BOOKING_ID, services, {
      tripStartDate: null,
      tripEndDate: null,
    })

    expect(store.rows("booking_service_units")[0]).toMatchObject({ adult_count: 2 })
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
