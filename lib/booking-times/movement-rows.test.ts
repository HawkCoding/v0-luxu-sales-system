import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { loadMovementTimeRows } from "@/lib/booking-times/movement-rows"

const BOOKING_ID = "00000000-0000-4000-8000-00000000bbbb"

interface MockTables {
  services?: unknown[]
  transportRequests?: unknown[]
}

/** Minimal chainable supabase mock covering the two tables the loader reads. */
function buildSupabase(tables: MockTables = {}) {
  function chain(result: { data: unknown; error: null }) {
    const self: Record<string, unknown> = {}
    for (const method of ["select", "eq", "in", "order"]) {
      self[method] = () => self
    }
    self.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return self
  }

  return {
    from: (table: string) => {
      if (table === "booking_services") return chain({ data: tables.services ?? [], error: null })
      if (table === "booking_transport_requests") {
        return chain({ data: tables.transportRequests ?? [], error: null })
      }
      return chain({ data: [], error: null })
    },
  } as unknown as SupabaseClient<Database>
}

function flightLeg(partial: Record<string, unknown> = {}) {
  return {
    id: "leg-flight",
    label: "Positioning flight",
    sort_order: 0,
    service_date: "2026-10-14",
    departure_time: "10:00:00",
    arrival_date: "2026-10-14",
    arrival_time: "12:15:00",
    flight_number: "FA212",
    departure_airport_code: "HLA",
    arrival_airport_code: "CPT",
    updated_at: "2026-08-17T09:00:00.000Z",
    suppliers: { name: "SAfair", kind: "airline" },
    routes: { name: "Lanseria INT Airport → Cape Town INT Airport" },
    ...partial,
  }
}

function transferRequest(partial: Record<string, unknown> = {}) {
  return {
    id: "req-transfer",
    service_id: "leg-transfer",
    service_type: "transfer",
    pickup_point: "Cape Town INT Airport",
    dropoff_point: "The Silo Hotel",
    pickup_at: "2026-10-14T12:45:00+02:00",
    flight_number: "FA212",
    sort_order: 0,
    updated_at: "2026-08-17T09:00:00.000Z",
    suppliers: { name: "Cape Chauffeurs" },
    rental_details: null,
    ...partial,
  }
}

describe("loadMovementTimeRows", () => {
  it("lists an airline leg as a flight with its captured schedule in HH:MM", async () => {
    const rows = await loadMovementTimeRows(buildSupabase({ services: [flightLeg()] }), BOOKING_ID)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: "service:leg-flight",
      kind: "service",
      movementType: "flight",
      label: "Positioning flight — Lanseria INT Airport → Cape Town INT Airport",
      supplierName: "SAfair",
      departureDate: "2026-10-14",
      departureTime: "10:00",
      arrivalDate: "2026-10-14",
      arrivalTime: "12:15",
      flightNumber: "FA212",
      departureAirportCode: "HLA",
      arrivalAirportCode: "CPT",
      hasArrival: true,
      hasFlightIdentity: true,
    })
  })

  it("leaves non-airline legs out — a train's schedule belongs to its route, not to one booking", async () => {
    const rows = await loadMovementTimeRows(
      buildSupabase({
        services: [
          flightLeg({ id: "leg-train", suppliers: { name: "The Blue Train", kind: "train_operator" } }),
          flightLeg({ id: "leg-hotel", suppliers: { name: "The Silo", kind: "hotel_property" } }),
        ],
      }),
      BOOKING_ID,
    )

    expect(rows).toEqual([])
  })

  it("gives a one-way transfer a pickup but no arrival half", async () => {
    const rows = await loadMovementTimeRows(
      buildSupabase({ transportRequests: [transferRequest()] }),
      BOOKING_ID,
    )

    expect(rows[0]).toMatchObject({
      kind: "transport_request",
      movementType: "transfer",
      label: "Transfer: Cape Town INT Airport → The Silo Hotel",
      hasArrival: false,
      hasFlightIdentity: false,
    })
    expect(rows[0].arrivalDate).toBeNull()
  })

  it("gives a rental a return half from its rental detail row", async () => {
    const rows = await loadMovementTimeRows(
      buildSupabase({
        transportRequests: [
          transferRequest({
            service_type: "rental",
            rental_details: { return_at: "2026-10-18T09:30:00+02:00" },
          }),
        ],
      }),
      BOOKING_ID,
    )

    expect(rows[0].movementType).toBe("rental")
    expect(rows[0].hasArrival).toBe(true)
    expect(rows[0].arrivalDate).toBe("2026-10-18")
  })

  it("still lists a legacy service_type='flight' request, so nothing becomes uneditable", async () => {
    const rows = await loadMovementTimeRows(
      buildSupabase({
        transportRequests: [
          transferRequest({ service_type: "flight", pickup_point: "JNB", dropoff_point: "CPT" }),
        ],
      }),
      BOOKING_ID,
    )

    expect(rows[0]).toMatchObject({
      kind: "transport_request",
      movementType: "flight",
      label: "Flight: JNB → CPT",
    })
  })

  it("scopes to the quote's legs and drops transport requests tied to none of them", async () => {
    const rows = await loadMovementTimeRows(
      buildSupabase({
        services: [flightLeg(), flightLeg({ id: "leg-other-flight" })],
        transportRequests: [transferRequest(), transferRequest({ id: "req-manual", service_id: null })],
      }),
      BOOKING_ID,
      { legIds: new Set(["leg-flight", "leg-transfer"]) },
    )

    expect(rows.map((row) => row.key)).toEqual(["service:leg-flight", "transport_request:req-transfer"])
  })

  it("treats an empty leg set as unscoped, matching the manual-quote convention", async () => {
    const rows = await loadMovementTimeRows(
      buildSupabase({ services: [flightLeg()], transportRequests: [transferRequest({ service_id: null })] }),
      BOOKING_ID,
      { legIds: new Set() },
    )

    expect(rows).toHaveLength(2)
  })
})
