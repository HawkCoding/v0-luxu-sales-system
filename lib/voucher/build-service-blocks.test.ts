import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"

interface MockTables {
  selections?: unknown[]
  transportRequests?: unknown[]
}

/** Minimal chainable supabase mock covering the two tables the block builder reads. */
function buildSupabase(tables: MockTables = {}) {
  function chain(result: { data: unknown; error: null }) {
    const self: Record<string, unknown> = {}
    for (const method of ["select", "eq", "in", "order"]) {
      self[method] = () => self
    }
    self.single = async () => result
    self.maybeSingle = async () => result
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return self
  }

  return {
    from: (table: string) => {
      if (table === "booking_package_selections") {
        return chain({ data: tables.selections ?? [], error: null })
      }
      if (table === "booking_transport_requests") {
        return chain({ data: tables.transportRequests ?? [], error: null })
      }
      return chain({ data: [], error: null })
    },
  } as unknown as SupabaseClient<Database>
}

function supplier(partial: Record<string, unknown> = {}) {
  return {
    name: "Cape Transfers",
    phone: "+27 21 000 0000",
    email: "ops@capetransfers.test",
    website: null,
    location: "Cape Town",
    kind: "transfers",
    default_time_start: null,
    default_time_end: null,
    inclusions: null,
    exclusions: null,
    ...partial,
  }
}

function transferSelection(partial: Record<string, unknown> = {}) {
  return {
    id: "sel-transfer",
    package_leg_id: "leg-transfer",
    selected: true,
    supplier_id: "supplier-transfer",
    route_id: "route-1",
    suite_type_id: "vehicle-sedan",
    service_date: null,
    nights: null,
    notes: "Leg-level note",
    package_legs: { sort_order: 2, label: "Airport transfers" },
    suppliers: supplier(),
    routes: { name: "Airport → Hotel", duration_days: null },
    suite_types: { name: "Sedan" },
    ...partial,
  }
}

describe("buildVoucherServiceBlocks", () => {
  it("renders one block per transfer request using the typed pickup/drop-off, never the route", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [transferSelection()],
        transportRequests: [
          {
            id: "req-1",
            package_leg_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "Cape Town International Airport",
            dropoff_point: "The Silo Hotel",
            pickup_at: "2026-09-01T08:30:00",
            flight_number: "SA321",
            notes: "Meet & greet",
            sort_order: 0,
            suppliers: supplier(),
            suite_types: { name: "Luxury Van" },
            rental_details: null,
          },
          {
            id: "req-2",
            package_leg_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "The Silo Hotel",
            dropoff_point: "Cape Town Station",
            pickup_at: "2026-09-03T14:00:00",
            flight_number: null,
            notes: null,
            sort_order: 1,
            suppliers: supplier(),
            suite_types: null,
            rental_details: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(2)

    const [first, second] = blocks
    expect(first.serviceType).toBe("transfer")
    expect(first.serviceData.pickup).toBe("Cape Town International Airport")
    expect(first.serviceData.dropoff).toBe("The Silo Hotel")
    expect(first.serviceData.departureDate).toBe("2026-09-01")
    expect(first.serviceData.startTime).toBe("08:30")
    expect(first.serviceData.flightNumber).toBe("SA321")
    expect(first.serviceData.vehicleType).toBe("Luxury Van")
    expect(first.serviceData.notes).toBe("Meet & greet")
    expect(first.serviceData.route).toBeUndefined()

    // No own vehicle category → falls back to the leg-level selection.
    expect(second.serviceData.vehicleType).toBe("Sedan")
    expect(second.serviceData.pickup).toBe("The Silo Hotel")

    // Both stay in the leg's slot, in captured order.
    expect(first.displayOrder).toBeLessThan(second.displayOrder)
    expect(Math.floor(first.displayOrder)).toBe(2)
  })

  it("keeps a single fallback block (route name, no pickup/drop-off) when a transfer leg has no requests", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ selections: [transferSelection()] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.route).toBe("Airport → Hotel")
    expect(blocks[0].serviceData.pickup).toBeUndefined()
    expect(blocks[0].serviceData.dropoff).toBeUndefined()
    expect(blocks[0].serviceData.vehicleType).toBe("Sedan")
  })

  it("appends manually added transfers (no package leg) after the package blocks", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [transferSelection()],
        transportRequests: [
          {
            id: "req-manual",
            package_leg_id: null,
            service_type: "transfer",
            pickup_point: "Private villa, Bantry Bay",
            dropoff_point: "V&A Waterfront",
            pickup_at: null,
            flight_number: null,
            notes: null,
            sort_order: 0,
            suppliers: supplier({ name: "Manual Shuttle Co" }),
            suite_types: { name: "SUV" },
            rental_details: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(2)
    const manual = blocks[1]
    expect(manual.contactDetails.name).toBe("Manual Shuttle Co")
    expect(manual.serviceData.pickup).toBe("Private villa, Bantry Bay")
    expect(manual.serviceData.vehicleType).toBe("SUV")
    expect(manual.displayOrder).toBeGreaterThan(blocks[0].displayOrder)
  })

  it("carries a rental's return date/time onto its block", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          transferSelection({
            suppliers: supplier({ kind: "vehicle_rental", name: "Cape Rentals" }),
            package_legs: { sort_order: 1, label: "Rental car" },
          }),
        ],
        transportRequests: [
          {
            id: "req-rental",
            package_leg_id: "leg-transfer",
            service_type: "rental",
            pickup_point: "Airport depot",
            dropoff_point: "Airport depot",
            pickup_at: "2026-09-01T09:00:00",
            flight_number: null,
            notes: null,
            sort_order: 0,
            suppliers: supplier({ kind: "vehicle_rental", name: "Cape Rentals" }),
            suite_types: { name: "SUV" },
            rental_details: { return_at: "2026-09-05T16:00:00" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.arrivalDate).toBe("2026-09-05")
    expect(blocks[0].serviceData.endTime).toBe("16:00")
  })

  it("leaves train selections rendering from the route as before", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "sel-train",
            package_leg_id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            package_legs: { sort_order: 0, label: "The Blue Train" },
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceType).toBe("train")
    expect(blocks[0].serviceData.route).toBe("Pretoria ↔ Cape Town")
    expect(blocks[0].serviceData.departureDate).toBe("2026-09-01")
    expect(blocks[0].serviceData.arrivalDate).toBe("2026-09-03")
  })
})
