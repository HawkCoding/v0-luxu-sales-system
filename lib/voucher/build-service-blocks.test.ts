import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildVoucherServiceBlocks } from "@/lib/voucher/build-service-blocks"

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"

interface MockTables {
  selections?: unknown[]
  services?: unknown[]
  transportRequests?: unknown[]
}

/** Minimal chainable supabase mock covering the tables the block builder reads. */
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
      if (table === "booking_services") {
        return chain({ data: [...(tables.selections ?? []), ...(tables.services ?? [])], error: null })
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
    id: "leg-transfer",
    selected: true,
    supplier_id: "supplier-transfer",
    route_id: "route-1",
    suite_type_id: "vehicle-sedan",
    service_date: null,
    nights: null,
    notes: "Leg-level note",
    sort_order: 2, label: "Airport transfers",
    suppliers: supplier(),
    routes: { name: "Airport → Hotel", duration_days: null },
    suite_types: { name: "Sedan" },
    ...partial,
  }
}

function flightService(partial: Record<string, unknown> = {}) {
  return {
    id: "leg-flight",
    selected: true,
    supplier_id: "supplier-airline",
    route_id: "route-flight",
    suite_type_id: null,
    service_date: "2026-10-14",
    nights: null,
    notes: null,
    sort_order: 0,
    label: "Positioning flight",
    departure_time: "10:00:00",
    arrival_date: "2026-10-14",
    arrival_time: "12:15:00",
    flight_number: "FA212",
    departure_airport_code: "HLA",
    arrival_airport_code: "CPT",
    hand_luggage_kg: 7,
    checked_luggage_kg: 23,
    suppliers: supplier({ name: "SAfair", kind: "airline" }),
    routes: { name: "Lanseria INT Airport → Cape Town INT Airport", duration_days: null },
    suite_types: null,
    units: [{ suite_type_id: "cabin-economy", sort_order: 0, suite_types: { name: "Economy" } }],
    ...partial,
  }
}

describe("buildVoucherServiceBlocks — flight legs", () => {
  it("resolves the leg's own captured schedule, cabin, flight number and airport codes", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ services: [flightService()] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceType).toBe("airline")
    expect(blocks[0].serviceData).toMatchObject({
      departureDate: "2026-10-14",
      // Postgres hands a `time` back as HH:MM:SS; every surface prints HH:MM.
      startTime: "10:00",
      arrivalDate: "2026-10-14",
      endTime: "12:15",
      flightNumber: "FA212",
      departureAirportCode: "HLA",
      arrivalAirportCode: "CPT",
      handLuggageKg: 7,
      checkedLuggageKg: 23,
      // The cabin is the booked suite type, with no noun appended (airline is not in
      // SUITE_NOUN_KINDS) — "Economy", never "Economy Suite".
      cabin: "Economy",
    })
  })

  it("keeps an overnight arrival on its real day", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        services: [flightService({ arrival_date: "2026-10-15", departure_time: "22:40:00", arrival_time: "06:15:00" })],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.departureDate).toBe("2026-10-14")
    expect(blocks[0].serviceData.arrivalDate).toBe("2026-10-15")
  })

  it("lets the captured arrival date beat a route duration", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        services: [
          flightService({
            routes: { name: "Lanseria → Cape Town", duration_days: 3 },
            arrival_date: "2026-10-14",
          }),
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    // A duration-derived arrival would land on the 16th; the captured fact wins outright.
    expect(blocks[0].serviceData.arrivalDate).toBe("2026-10-14")
  })

  it("falls back to the supplier's default times for a leg captured before flight times existed", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        services: [
          flightService({
            departure_time: null,
            arrival_time: null,
            arrival_date: null,
            suppliers: supplier({
              name: "SAfair",
              kind: "airline",
              default_time_start: "09:00:00",
              default_time_end: "11:00:00",
            }),
          }),
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.startTime).toBe("09:00")
    expect(blocks[0].serviceData.endTime).toBe("11:00")
  })

  it("leaves the flight fields off a non-airline leg", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        services: [
          flightService({
            suppliers: supplier({ name: "The Blue Train", kind: "train_operator" }),
            routes: { name: "Pretoria → Cape Town", duration_days: 2, departure_time: "12:00:00", arrival_time: "18:00:00" },
          }),
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceType).toBe("train")
    expect(blocks[0].serviceData.flightNumber).toBeNull()
    expect(blocks[0].serviceData.cabin).toBeNull()
    expect(blocks[0].serviceData.departureAirportCode).toBeNull()
    // A train still takes its schedule from the route, not from the leg's flight columns.
    expect(blocks[0].serviceData.startTime).toBe("12:00")
  })
})

describe("buildVoucherServiceBlocks", () => {
  it("renders one block per transfer request using the typed pickup/drop-off, never the route", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [transferSelection()],
        transportRequests: [
          {
            id: "req-1",
            service_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "Cape Town International Airport",
            dropoff_point: "The Silo Hotel",
            pickup_at: "2026-09-01T06:30:00.000Z",
            flight_number: "SA321",
            notes: "Meet & greet",
            sort_order: 0,
            suppliers: supplier(),
            suite_types: { name: "Luxury Van" },
            rental_details: null,
          },
          {
            id: "req-2",
            service_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "The Silo Hotel",
            dropoff_point: "Cape Town Station",
            pickup_at: "2026-09-03T12:00:00.000Z",
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

  it("prints a transfer's pickup time in South African time, not the server process's UTC clock", async () => {
    // Entered as 16:00 in the builder (SAST, UTC+2) — Postgrest returns the stored timestamptz
    // as its UTC instant, 14:00Z. The block builder runs server-side (UTC on Vercel), so it must
    // convert back to SAST rather than reading the UTC clock hour directly.
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [transferSelection()],
        transportRequests: [
          {
            id: "req-1600-sast",
            service_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "Cape Town Station",
            dropoff_point: "Hotel",
            pickup_at: "2026-10-28T14:00:00.000Z",
            flight_number: null,
            notes: null,
            sort_order: 0,
            suppliers: supplier(),
            suite_types: null,
            rental_details: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.departureDate).toBe("2026-10-28")
    expect(blocks[0].serviceData.startTime).toBe("16:00")
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
            service_id: null,
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
            sort_order: 1,
            label: "Rental car",
          }),
        ],
        transportRequests: [
          {
            id: "req-rental",
            service_id: "leg-transfer",
            service_type: "rental",
            pickup_point: "Airport depot",
            dropoff_point: "Airport depot",
            pickup_at: "2026-09-01T07:00:00.000Z",
            flight_number: null,
            notes: null,
            sort_order: 0,
            suppliers: supplier({ kind: "vehicle_rental", name: "Cape Rentals" }),
            suite_types: { name: "SUV" },
            rental_details: { return_at: "2026-09-05T14:00:00.000Z" },
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
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
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
    // Legacy row: no unit children, falls back to the leg-level suite_types join.
    expect(blocks[0].serviceData.suiteType).toBe("Royal Suite")
    expect(blocks[0].serviceData.numberOfSuites).toBe(1)
  })

  it("gives a 1-day train route an arrival date on its departure day", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2028-08-25",
            nights: null,
            notes: null,
            sort_order: 0, label: "Rovos Rail",
            suppliers: supplier({ kind: "train_operator", name: "Rovos Rail" }),
            routes: { name: "Pretoria → Cape Town", duration_days: 1 },
            suite_types: { name: "Pullman Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.departureDate).toBe("2028-08-25")
    expect(blocks[0].serviceData.arrivalDate).toBe("2028-08-25")
  })

  it("leaves a train arrival date unset when the route has no duration, so the voucher prints TBC", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2028-08-25",
            nights: null,
            notes: null,
            sort_order: 0, label: "Rovos Rail",
            suppliers: supplier({ kind: "train_operator", name: "Rovos Rail" }),
            routes: { name: "Pretoria → Cape Town", duration_days: null },
            suite_types: { name: "Pullman Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.arrivalDate).toBeNull()
  })

  it("takes a train's times from its route, not from the operator's supplier-wide defaults", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            // Stale supplier-wide pair from before times moved onto the route — must not win.
            suppliers: supplier({
              kind: "train_operator",
              name: "Blue Train",
              default_time_start: "06:00:00",
              default_time_end: "12:00:00",
            }),
            routes: {
              name: "Pretoria → Cape Town",
              duration_days: 2,
              departure_time: "08:30:00",
              arrival_time: "17:45:00",
              return_departure_time: null,
              return_arrival_time: null,
            },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.startTime).toBe("08:30")
    expect(blocks[0].serviceData.endTime).toBe("17:45")
  })

  it("prints the return times when the booking travels a two-way route in reverse", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            route_reversed: true,
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: {
              name: "Pretoria ↔ Cape Town",
              duration_days: 2,
              direction_mode: "round_trip",
              departure_time: "08:30:00",
              arrival_time: "17:45:00",
              return_departure_time: "10:15:00",
              return_arrival_time: "19:00:00",
            },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.startTime).toBe("10:15")
    expect(blocks[0].serviceData.endTime).toBe("19:00")
  })

  it("leaves a train's times unset when its route has none, rather than borrowing the supplier's", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "Rovos Rail",
            suppliers: supplier({
              kind: "train_operator",
              name: "Rovos Rail",
              default_time_start: "06:00:00",
              default_time_end: "12:00:00",
            }),
            routes: {
              name: "Pretoria → Cape Town",
              duration_days: 2,
              departure_time: null,
              arrival_time: null,
              return_departure_time: null,
              return_arrival_time: null,
            },
            suite_types: { name: "Pullman Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.startTime).toBeNull()
    expect(blocks[0].serviceData.endTime).toBeNull()
  })

  it("still reads a hotel's times from the supplier — a hotel's route is its meal plan", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-hotel",
            selected: true,
            supplier_id: "supplier-hotel",
            route_id: "meal-plan-bb",
            suite_type_id: "room-deluxe",
            service_date: "2026-09-04",
            nights: 2,
            notes: null,
            sort_order: 1, label: "The Silo Hotel",
            suppliers: supplier({
              kind: "hotel_property",
              name: "The Silo Hotel",
              default_time_start: "14:00:00",
              default_time_end: "11:00:00",
            }),
            routes: { name: "Bed & Breakfast", duration_days: null },
            suite_types: { name: "Deluxe Room" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.startTime).toBe("14:00")
    expect(blocks[0].serviceData.endTime).toBe("11:00")
  })

  it("resolves suite type and suite count from per-unit rows when present, over the legacy leg-level join", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-stale",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            // Leg-level join is stale (pre-cutover value) — units must win.
            suite_types: { name: "Stale Suite" },
            units: [
              { suite_type_id: "suite-deluxe", sort_order: 1, suite_types: { name: "Deluxe Suite" } },
              { suite_type_id: "suite-deluxe-2", sort_order: 0, suite_types: { name: "Deluxe Suite" } },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    // Two units, same suite name, de-duplicated for display; count reflects both rooms.
    expect(blocks[0].serviceData.suiteType).toBe("Deluxe Suite")
    expect(blocks[0].serviceData.numberOfSuites).toBe(2)
  })

  it("composes each train unit's bed/bathroom configuration into its suite label", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-deluxe",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: null,
            units: [
              {
                suite_type_id: "suite-deluxe",
                sort_order: 0,
                suite_types: { name: "Deluxe Suite" },
                bedroom_types: { name: "Twin" },
                bedroom_layouts: null,
                bathroom_types: { name: "Shower" },
              },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.suiteType).toBe("Twin bedded Deluxe Suite with a shower")
  })

  it("appends the Suite noun to a train unit's type name when it isn't already nouned", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-deluxe",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: null,
            units: [
              {
                suite_type_id: "suite-deluxe",
                sort_order: 0,
                suite_types: { name: "Deluxe" },
                bedroom_types: { name: "Twin" },
                bedroom_layouts: null,
                bathroom_types: { name: "Shower" },
              },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.suiteType).toBe("Twin bedded Deluxe Suite with a shower")
  })

  it("puts a bedroom layout after the bathroom, keeping bedding as the leading word", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-deluxe",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "Rovos Rail",
            suppliers: supplier({ kind: "train_operator", name: "Rovos Rail" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: null,
            units: [
              {
                suite_type_id: "suite-deluxe",
                sort_order: 0,
                suite_types: { name: "Deluxe Suite" },
                bedroom_types: { name: "Twin" },
                bedroom_layouts: { name: "Crosswise" },
                bathroom_types: { name: "Shower" },
              },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.suiteType).toBe("Twin bedded Deluxe Suite with a shower, Crosswise")
  })

  it("leaves a hotel unit's room name plain — no bed/bathroom suffix", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-hotel",
            selected: true,
            supplier_id: "supplier-hotel",
            route_id: "route-hotel",
            suite_type_id: null,
            service_date: "2026-09-01",
            nights: 2,
            notes: null,
            sort_order: 0, label: "Irene Country Lodge",
            suppliers: supplier({ kind: "hotel_property", name: "Irene Country Lodge" }),
            routes: { name: "Full Board", duration_days: null },
            suite_types: null,
            units: [
              {
                suite_type_id: "room-standard",
                sort_order: 0,
                suite_types: { name: "Standard Room" },
                bedroom_types: { name: "Twin" },
                bedroom_layouts: null,
                bathroom_types: { name: "En-suite shower" },
              },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.roomType).toBe("Standard Room")
  })

  it("appends the Room noun to a hotel unit's type name when it isn't already nouned", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-hotel",
            selected: true,
            supplier_id: "supplier-hotel",
            route_id: "route-hotel",
            suite_type_id: null,
            service_date: "2026-09-01",
            nights: 2,
            notes: null,
            sort_order: 0, label: "Irene Country Lodge",
            suppliers: supplier({ kind: "hotel_property", name: "Irene Country Lodge" }),
            routes: { name: "Full Board", duration_days: null },
            suite_types: null,
            units: [
              {
                suite_type_id: "room-deluxe",
                sort_order: 0,
                suite_types: { name: "Deluxe" },
                bedroom_types: { name: "Twin" },
                bedroom_layouts: null,
                bathroom_types: { name: "En-suite shower" },
              },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    // No bed/bathroom suffix (includeConfig is false for hotel legs) — only the noun is added.
    expect(blocks[0].serviceData.roomType).toBe("Deluxe Room")
  })

  it("joins distinct suite names across mixed per-unit rows", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-hotel",
            selected: true,
            supplier_id: "supplier-hotel",
            route_id: "route-hotel",
            suite_type_id: null,
            service_date: "2026-09-01",
            nights: 2,
            notes: null,
            sort_order: 0, label: "Irene Country Lodge",
            suppliers: supplier({ kind: "hotel_property", name: "Irene Country Lodge" }),
            routes: { name: "Full Board", duration_days: null },
            suite_types: null,
            units: [
              { suite_type_id: "room-standard", sort_order: 0, suite_types: { name: "Standard Room" } },
              { suite_type_id: "leg-blue-train", sort_order: 1, suite_types: { name: "Deluxe Room" } },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.roomType).toBe("Standard Room, Deluxe Room")
    expect(blocks[0].serviceData.numberOfSuites).toBe(2)
  })

  it("scopes selections (and their leg-scoped transport requests) to legIds when given, so a leg left selected on the job but not priced into this quote is excluded", async () => {
    const blueTrain = {
      id: "leg-blue-train",
      selected: true,
      supplier_id: "supplier-blue-train",
      route_id: "route-blue-train",
      suite_type_id: "suite-royal",
      service_date: "2026-08-01",
      nights: null,
      notes: null,
      sort_order: 0, label: "The Blue Train",
      suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
      routes: { name: "Pretoria ↔ Cape Town", duration_days: 1 },
      suite_types: { name: "Royal Suite" },
    }
    // Selected on the job (e.g. left over from an earlier draft) but never priced into this
    // quote — must be dropped, along with the transfer request captured against its leg.
    const rovosRailTransfer = transferSelection({
      id: "leg-rovos-transfer",
      sort_order: 1, label: "Rovos Rail transfer",
    })
    const rovosTransferRequest = {
      id: "req-rovos-transfer",
      service_id: "leg-rovos-transfer",
      service_type: "transfer",
      pickup_point: "Rovos Rail Station",
      dropoff_point: "The Silo Hotel",
      pickup_at: "2026-09-01T14:00:00.000Z",
      flight_number: null,
      notes: null,
      sort_order: 0,
      suppliers: supplier(),
      suite_types: null,
      rental_details: null,
    }

    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [blueTrain, rovosRailTransfer],
        transportRequests: [rovosTransferRequest],
      }),
      { bookingId: BOOKING_ID, legIds: new Set(["leg-blue-train"]) },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].contactDetails.name).toBe("Blue Train")
    expect(blocks[0].serviceData.departureDate).toBe("2026-08-01")
  })

  it("drops transport requests tied to no leg when includeUnlinkedTransportRequests is false, since nothing unlinked can have been priced into a quote", async () => {
    const unlinkedRequest = {
      id: "req-manual",
      service_id: null,
      service_type: "transfer",
      pickup_point: "OR Tambo",
      dropoff_point: "Rovos Rail Station",
      pickup_at: "2026-08-01T07:00:00.000Z",
      flight_number: null,
      notes: null,
      sort_order: 0,
      suppliers: supplier(),
      suite_types: null,
      rental_details: null,
    }

    const tables = { transportRequests: [unlinkedRequest] }

    const included = await buildVoucherServiceBlocks(buildSupabase(tables), { bookingId: BOOKING_ID })
    expect(included.blocks).toHaveLength(1)

    const excluded = await buildVoucherServiceBlocks(buildSupabase(tables), {
      bookingId: BOOKING_ID,
      includeUnlinkedTransportRequests: false,
    })
    expect(excluded.blocks).toHaveLength(0)
  })

  it("renders a Build Booking (booking_services) leg the same as an equivalent catalogue-package selection", async () => {
    const trainService = {
      id: "svc-blue-train",
      label: "The Blue Train",
      sort_order: 0,
      selected: true,
      supplier_id: "supplier-blue-train",
      route_id: "route-blue-train",
      route_reversed: false,
      suite_type_id: null,
      service_date: "2026-08-01",
      nights: null,
      notes: null,
      supplier_reference: null,
      suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
      routes: { name: "Pretoria ↔ Cape Town", duration_days: 1, direction_mode: null, origin: null, destination: null },
      suite_types: { name: "Royal Suite" },
      units: null,
    }

    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ services: [trainService] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].title).toBe("The Blue Train")
    expect(blocks[0].contactDetails.name).toBe("Blue Train")
    expect(blocks[0].serviceData.departureDate).toBe("2026-08-01")
    expect(blocks[0].serviceData.roomType).toBeNull()
  })

  it("resolves a non-train supplier's printed location from its joined city, not its free-text location", async () => {
    const hotelLeg = {
      id: "svc-hotel",
      label: "The Silo Hotel",
      sort_order: 0,
      selected: true,
      supplier_id: "supplier-hotel",
      route_id: null,
      service_date: "2026-08-01",
      nights: 2,
      notes: null,
      supplier_reference: null,
      // A hotel's free-text `location` is retired -- only train operators still carry it. If the
      // resolver read it instead of `city`, this stale value would leak onto the voucher.
      suppliers: supplier({
        kind: "hotel_property",
        name: "The Silo Hotel",
        location: "STALE FREE TEXT",
        location_id: "loc-cape-town",
        city: { name: "Cape Town" },
      }),
      routes: { name: "Bed & Breakfast", duration_days: null },
      suite_types: { name: "Ocean Suite" },
      units: null,
    }

    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ services: [hotelLeg] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].contactDetails.location).toBe("Cape Town")
  })

  it("resolves a train operator's printed location from its free-text location, ignoring city", async () => {
    const trainLeg = {
      id: "svc-blue-train-location",
      label: "The Blue Train",
      sort_order: 0,
      selected: true,
      supplier_id: "supplier-blue-train",
      route_id: "route-blue-train",
      suite_type_id: null,
      service_date: "2026-08-01",
      nights: null,
      notes: null,
      supplier_reference: null,
      // A train has no single city, so `city` (if ever joined) must never win over the free text.
      suppliers: supplier({
        kind: "train_operator",
        name: "Blue Train",
        location: "Pretoria",
        location_id: null,
        city: null,
      }),
      routes: { name: "Pretoria ↔ Cape Town", duration_days: 1, direction_mode: null, origin: null, destination: null },
      suite_types: { name: "Royal Suite" },
      units: null,
    }

    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ services: [trainLeg] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].contactDetails.location).toBe("Pretoria")
  })

  it("swaps the arrival station to the route's origin on a reversed round-trip leg, regardless of the supplier's own static location", async () => {
    const returnLeg = {
      id: "svc-blue-train-return",
      label: "The Blue Train (return)",
      sort_order: 1,
      selected: true,
      supplier_id: "supplier-blue-train",
      route_id: "route-blue-train",
      route_reversed: true,
      suite_type_id: null,
      service_date: "2026-08-05",
      nights: null,
      notes: null,
      supplier_reference: null,
      // Supplier's static `location` is the outbound destination — must never be read for the
      // arrival station, only the route's actual endpoints + route_reversed matter.
      suppliers: supplier({ kind: "train_operator", name: "Blue Train", location: "Cape Town" }),
      routes: {
        name: "Pretoria ↔ Cape Town",
        duration_days: 1,
        direction_mode: "round_trip",
        origin: { name: "Pretoria" },
        destination: { name: "Cape Town" },
      },
      suite_types: { name: "Royal Suite" },
      units: null,
    }

    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ services: [returnLeg] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.route).toBe("Cape Town → Pretoria")
    expect(blocks[0].serviceData.arrivalStation).toBe("Pretoria")
  })

  it("matches a transport request keyed by service_id to its booking_services leg, and never double-counts it as a manual request", async () => {
    const transferService = {
      id: "svc-transfer",
      label: "Airport transfers",
      sort_order: 0,
      selected: true,
      supplier_id: "supplier-transfer",
      route_id: "route-1",
      route_reversed: false,
      suite_type_id: "vehicle-sedan",
      service_date: null,
      nights: null,
      notes: null,
      supplier_reference: null,
      suppliers: supplier(),
      routes: { name: "Airport → Hotel", duration_days: null, direction_mode: null, origin: null, destination: null },
      suite_types: { name: "Sedan" },
      units: null,
    }
    const request = {
      id: "req-1",
      service_id: "svc-transfer",
      service_type: "transfer",
      pickup_point: "Cape Town International Airport",
      dropoff_point: "The Silo Hotel",
      pickup_at: "2026-09-01T06:30:00.000Z",
      flight_number: null,
      notes: null,
      sort_order: 0,
      suppliers: supplier(),
      suite_types: { name: "Sedan" },
      rental_details: null,
    }

    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({ services: [transferService], transportRequests: [request] }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].serviceData.pickup).toBe("Cape Town International Airport")
  })

  describe("train station addresses", () => {
    const PRETORIA_ID = "loc-pretoria"
    const CAPE_TOWN_ID = "loc-cape-town"

    const stationRows = [
      {
        location_id: PRETORIA_ID,
        station_name: "Rovos Rail Station",
        street_address: "Capital Park, Pretoria",
      },
      {
        location_id: CAPE_TOWN_ID,
        station_name: "Cape Town Station",
        street_address: "Adderley Street",
      },
    ]

    function trainLeg(partial: Record<string, unknown> = {}, supplierPartial: Record<string, unknown> = {}) {
      return {
        id: "svc-rovos",
        label: "Rovos Rail",
        sort_order: 0,
        selected: true,
        supplier_id: "supplier-rovos",
        route_id: "route-rovos",
        route_reversed: false,
        suite_type_id: null,
        service_date: "2026-09-01",
        nights: null,
        notes: null,
        supplier_reference: null,
        suppliers: supplier({
          kind: "train_operator",
          name: "Rovos Rail",
          station_addresses: stationRows,
          ...supplierPartial,
        }),
        routes: {
          name: "Pretoria ↔ Cape Town",
          duration_days: 3,
          direction_mode: "round_trip",
          origin: { id: PRETORIA_ID, name: "Pretoria" },
          destination: { id: CAPE_TOWN_ID, name: "Cape Town" },
        },
        suite_types: null,
        units: null,
        ...partial,
      }
    }

    it("resolves boarding and arrival addresses from the route's own endpoint cities", async () => {
      const { blocks } = await buildVoucherServiceBlocks(
        buildSupabase({ services: [trainLeg()] }),
        { bookingId: BOOKING_ID },
      )

      expect(blocks[0].serviceData.boardingPoint).toBe("Rovos Rail Station, Capital Park, Pretoria")
      expect(blocks[0].serviceData.arrivalPoint).toBe("Cape Town Station, Adderley Street")
    })

    it("swaps boarding and arrival on a reversed leg, matching the arrival station", async () => {
      const { blocks } = await buildVoucherServiceBlocks(
        buildSupabase({ services: [trainLeg({ route_reversed: true })] }),
        { bookingId: BOOKING_ID },
      )

      expect(blocks[0].serviceData.boardingPoint).toBe("Cape Town Station, Adderley Street")
      expect(blocks[0].serviceData.arrivalPoint).toBe("Rovos Rail Station, Capital Park, Pretoria")
      expect(blocks[0].serviceData.arrivalStation).toBe("Pretoria")
    })

    it("leaves both null when the supplier has no station rows, never falling back to street_address", async () => {
      const { blocks } = await buildVoucherServiceBlocks(
        buildSupabase({
          services: [trainLeg({}, { station_addresses: null, street_address: "1 Head Office Road" })],
        }),
        { bookingId: BOOKING_ID },
      )

      expect(blocks[0].serviceData.boardingPoint).toBeNull()
      expect(blocks[0].serviceData.arrivalPoint).toBeNull()
      expect(blocks[0].contactDetails.streetAddress).toBe("1 Head Office Road")
    })

    it("resolves only the cities it has rows for, leaving the other side null", async () => {
      const { blocks } = await buildVoucherServiceBlocks(
        buildSupabase({
          services: [trainLeg({}, { station_addresses: [stationRows[0]] })],
        }),
        { bookingId: BOOKING_ID },
      )

      expect(blocks[0].serviceData.boardingPoint).toBe("Rovos Rail Station, Capital Park, Pretoria")
      expect(blocks[0].serviceData.arrivalPoint).toBeNull()
    })

    it("never sets station points on a non-train block", async () => {
      const { blocks } = await buildVoucherServiceBlocks(
        buildSupabase({
          selections: [
            {
              id: "leg-hotel",
              selected: true,
              supplier_id: "supplier-hotel",
              route_id: null,
              suite_type_id: null,
              service_date: "2026-09-04",
              nights: 2,
              notes: null,
              sort_order: 0, label: "The Silo Hotel",
              suppliers: supplier({
                kind: "hotel_property",
                name: "The Silo Hotel",
                station_addresses: stationRows,
              }),
              routes: null,
              suite_types: null,
              units: null,
            },
          ],
        }),
        { bookingId: BOOKING_ID },
      )

      expect(blocks[0].serviceType).toBe("hotel")
      expect(blocks[0].serviceData.boardingPoint).toBeNull()
      expect(blocks[0].serviceData.arrivalPoint).toBeNull()
    })
  })

  it("sums adult/child/infant counts across a train leg's units into guestBreakdown", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-deluxe",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: null,
            units: [
              { suite_type_id: "s1", sort_order: 0, adult_count: 2, child_count: 0, infant_count: 0, suite_types: { name: "Deluxe" } },
              { suite_type_id: "leg-train", sort_order: 1, adult_count: 1, child_count: 1, infant_count: 0, suite_types: { name: "Deluxe" } },
            ],
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.guestBreakdown).toEqual({ adults: 3, children: 1, infants: 0 })
  })

  it("omits guestBreakdown when a leg has no unit rows (legacy pre-cutover selection)", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "sel-train-legacy",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.guestBreakdown).toBeNull()
  })

  it("carries the supplier description onto contactDetails for train and manual-transfer blocks", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train", description: "Luxury rail since 1989." }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].contactDetails.description).toBe("Luxury rail since 1989.")
  })

  it("carries passenger_count onto a transfer block's passengerCount", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [transferSelection()],
        transportRequests: [
          {
            id: "req-pax",
            service_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "Airport",
            dropoff_point: "Hotel",
            pickup_at: null,
            flight_number: null,
            passenger_count: 3,
            notes: null,
            sort_order: 0,
            suppliers: supplier(),
            suite_types: null,
            rental_details: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.passengerCount).toBe(3)
  })

  it("routes meal-seating/smoking to train blocks and dietary/occasion to hotel blocks", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-01",
            nights: null,
            notes: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3 },
            suite_types: { name: "Royal Suite" },
          },
          {
            id: "leg-hotel",
            selected: true,
            supplier_id: "supplier-hotel",
            route_id: "route-hotel",
            suite_type_id: null,
            service_date: "2026-09-05",
            nights: 2,
            notes: null,
            sort_order: 1, label: "Irene Country Lodge",
            suppliers: supplier({ kind: "hotel_property", name: "Irene Country Lodge" }),
            routes: { name: "Full Board", duration_days: null },
            suite_types: null,
          },
          transferSelection(),
        ],
      }),
      {
        bookingId: BOOKING_ID,
        reservationDetails: {
          dietary: "Vegetarian",
          occasion: "Birthday Celebration",
          mealSeating: "first",
          smokingPreference: "non_smoking",
        },
      },
    )

    const train = blocks.find((b) => b.serviceType === "train")
    const hotel = blocks.find((b) => b.serviceType === "hotel")
    const transfer = blocks.find((b) => b.serviceType === "transfer")

    expect(train?.serviceData.requestsLine).toBe("1st seating meals; Nonsmoking")
    expect(train?.serviceData.occasion).toBeNull()
    expect(train?.serviceData.dietary).toBeNull()

    expect(hotel?.serviceData.occasion).toBe("Birthday Celebration")
    expect(hotel?.serviceData.dietary).toBe("Vegetarian")
    expect(hotel?.serviceData.requestsLine).toBeNull()

    // Not a train/hotel type — the party's preferences aren't printed on a transfer block.
    expect(transfer?.serviceData.requestsLine).toBeNull()
    expect(transfer?.serviceData.occasion).toBeNull()
    expect(transfer?.serviceData.dietary).toBeNull()
  })

  it("stands a tour block's itinerary in from the route name when nothing else is captured", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-tour",
            selected: true,
            supplier_id: "supplier-tour",
            route_id: "route-tour",
            suite_type_id: null,
            service_date: "2026-09-08",
            nights: null,
            notes: null,
            sort_order: 0, label: "Kimberley Excursion",
            suppliers: supplier({ kind: "tour_operator", name: "Kimberley Tours" }),
            routes: { name: "Kimberley Day Tour", duration_days: 1 },
            suite_types: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceType).toBe("tour")
    expect(blocks[0].serviceData.itinerary).toBe("Kimberley Day Tour")
  })

  it("leaves a tour leg's suite type name untouched — no noun appended for non-train/hotel kinds", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-tour",
            selected: true,
            supplier_id: "supplier-tour",
            route_id: "route-tour",
            suite_type_id: "tour-type",
            service_date: "2026-09-08",
            nights: null,
            notes: null,
            sort_order: 0, label: "Kimberley Excursion",
            suppliers: supplier({ kind: "tour_operator", name: "Kimberley Tours" }),
            routes: { name: "Kimberley Day Tour", duration_days: 1 },
            suite_types: { name: "Full Day" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.suiteType).toBe("Full Day")
  })

  it("builds an airline block from a service_type='flight' transport request", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        transportRequests: [
          {
            id: "req-flight",
            service_id: null,
            service_type: "flight",
            pickup_point: "CPT",
            dropoff_point: "JNB",
            pickup_at: "2026-09-11T14:20:00.000Z",
            flight_number: "FA-120",
            passenger_count: 2,
            notes: null,
            sort_order: 0,
            supplier_reference: "FZBP2Z",
            supplier_contact_name: null,
            voucher_footnote: "Check in 1h30 min prior to departure",
            suppliers: supplier({ name: "FlySafair", kind: "airline" }),
            suite_types: null,
            rental_details: null,
            flight_details: {
              cabin: "Economy",
              departure_airport_code: "CPT",
              arrival_airport_code: "JNB",
              arrival_at: "2026-09-11T16:25:00.000Z",
              hand_luggage_kg: 7,
              checked_luggage_kg: 20,
              priority_boarding: true,
            },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks).toHaveLength(1)
    const flight = blocks[0]
    expect(flight.serviceType).toBe("airline")
    expect(flight.supplierReference).toBe("FZBP2Z")
    expect(flight.serviceData.departureAirportCode).toBe("CPT")
    expect(flight.serviceData.arrivalAirportCode).toBe("JNB")
    expect(flight.serviceData.route).toBe("CPT → JNB")
    expect(flight.serviceData.departureDate).toBe("2026-09-11")
    expect(flight.serviceData.startTime).toBe("16:20")
    expect(flight.serviceData.arrivalDate).toBe("2026-09-11")
    expect(flight.serviceData.endTime).toBe("18:25")
    expect(flight.serviceData.cabin).toBe("Economy")
    expect(flight.serviceData.handLuggageKg).toBe(7)
    expect(flight.serviceData.checkedLuggageKg).toBe(20)
    expect(flight.serviceData.priorityBoarding).toBe(true)
    expect(flight.serviceData.footnote).toBe("Check in 1h30 min prior to departure")
  })

  it("carries the party's traveller names onto a flight block as passengerNames", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        transportRequests: [
          {
            id: "req-flight",
            service_id: null,
            service_type: "flight",
            pickup_point: "CPT",
            dropoff_point: "JNB",
            pickup_at: "2026-09-11T14:20:00.000Z",
            flight_number: "FA-120",
            passenger_count: 2,
            notes: null,
            sort_order: 0,
            suppliers: supplier({ name: "FlySafair", kind: "airline" }),
            suite_types: null,
            rental_details: null,
            flight_details: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID, travellerNames: ["Hans Ntshele Makweng", "Manini Florence Theletsane"] },
    )

    expect(blocks[0].serviceData.passengerNames).toEqual(["Hans Ntshele Makweng", "Manini Florence Theletsane"])
  })

  it("does not carry passengerNames onto a non-flight transfer block", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [transferSelection()],
        transportRequests: [
          {
            id: "req-transfer",
            service_id: "leg-transfer",
            service_type: "transfer",
            pickup_point: "Airport",
            dropoff_point: "Hotel",
            pickup_at: null,
            flight_number: null,
            notes: null,
            sort_order: 0,
            suppliers: supplier(),
            suite_types: null,
            rental_details: null,
          },
        ],
      }),
      { bookingId: BOOKING_ID, travellerNames: ["Hans Ntshele Makweng"] },
    )

    expect(blocks[0].serviceData.passengerNames).toBeUndefined()
  })

  it("carries a leg's own contact name, footnote and excursions onto its block", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-07",
            nights: null,
            notes: null,
            supplier_contact_name: "Carla",
            voucher_footnote: "Check in IRENE COUNTRY LODGE 2h prior to departure",
            excursions: ["Kimberley **Weather & Time Permitted"],
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3, default_excursions: ["Route default"] },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].supplierContactName).toBe("Carla")
    expect(blocks[0].serviceData.footnote).toBe("Check in IRENE COUNTRY LODGE 2h prior to departure")
    expect(blocks[0].serviceData.excursions).toEqual(["Kimberley **Weather & Time Permitted"])
  })

  it("falls back to the route's default_excursions when the leg has none of its own", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          {
            id: "leg-train",
            selected: true,
            supplier_id: "supplier-train",
            route_id: "route-train",
            suite_type_id: "suite-royal",
            service_date: "2026-09-07",
            nights: null,
            notes: null,
            excursions: null,
            sort_order: 0, label: "The Blue Train",
            suppliers: supplier({ kind: "train_operator", name: "Blue Train" }),
            routes: { name: "Pretoria ↔ Cape Town", duration_days: 3, default_excursions: ["Kimberley day trip"] },
            suite_types: { name: "Royal Suite" },
          },
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].serviceData.excursions).toEqual(["Kimberley day trip"])
  })

  it("uses the supplier's default_contact_name when the leg doesn't override it", async () => {
    const { blocks } = await buildVoucherServiceBlocks(
      buildSupabase({
        selections: [
          transferSelection({
            suppliers: supplier({ default_contact_name: "Pierre" }),
          }),
        ],
      }),
      { bookingId: BOOKING_ID },
    )

    expect(blocks[0].supplierContactName).toBe("Pierre")
  })
})
