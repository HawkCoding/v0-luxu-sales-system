import { describe, expect, it } from "vitest"
import {
  buildSupplierRouteSchedules,
  resolveRouteSchedule,
  routeHasReturnLeg,
  toHoursMinutes,
  type TrainLegRow,
} from "@/lib/routes/route-schedule"

const ROUTE = {
  departure_time: "08:30:00",
  arrival_time: "17:45:00",
  return_departure_time: "10:15:00",
  return_arrival_time: "19:00:00",
}

describe("toHoursMinutes", () => {
  it("trims a Postgres time to HH:MM", () => {
    expect(toHoursMinutes("08:30:00")).toBe("08:30")
  })

  it("treats empty and missing values as unset", () => {
    expect(toHoursMinutes(null)).toBeNull()
    expect(toHoursMinutes(undefined)).toBeNull()
    expect(toHoursMinutes("   ")).toBeNull()
  })
})

describe("resolveRouteSchedule", () => {
  it("uses the outbound pair when the booking travels the route as stored", () => {
    expect(resolveRouteSchedule(ROUTE, false)).toEqual({ startTime: "08:30", endTime: "17:45" })
  })

  it("uses the return pair when the booking travels the route in reverse", () => {
    expect(resolveRouteSchedule(ROUTE, true)).toEqual({ startTime: "10:15", endTime: "19:00" })
  })

  it("falls back to the outbound pair when a reversed route has no return times captured", () => {
    const schedule = resolveRouteSchedule(
      { ...ROUTE, return_departure_time: null, return_arrival_time: null },
      true,
    )
    expect(schedule).toEqual({ startTime: "08:30", endTime: "17:45" })
  })

  it("falls back per field, so a half-captured return leg still prints what it knows", () => {
    const schedule = resolveRouteSchedule({ ...ROUTE, return_arrival_time: null }, true)
    expect(schedule).toEqual({ startTime: "10:15", endTime: "17:45" })
  })

  it("returns nothing for a route with no times at all", () => {
    const schedule = resolveRouteSchedule(
      {
        departure_time: null,
        arrival_time: null,
        return_departure_time: null,
        return_arrival_time: null,
      },
      false,
    )
    expect(schedule).toEqual({ startTime: null, endTime: null })
  })

  it("returns nothing for a missing route", () => {
    expect(resolveRouteSchedule(null, false)).toEqual({ startTime: null, endTime: null })
    expect(resolveRouteSchedule(undefined, true)).toEqual({ startTime: null, endTime: null })
  })
})

describe("buildSupplierRouteSchedules", () => {
  function leg(partial: Partial<TrainLegRow> = {}): TrainLegRow {
    return {
      supplier_id: "supplier-train",
      route_reversed: false,
      supplierKind: "train_operator",
      route: ROUTE,
      ...partial,
    }
  }

  it("resolves a leg travelling the route as stored", () => {
    expect(buildSupplierRouteSchedules([leg()])).toEqual([
      { supplierId: "supplier-train", departureTime: "08:30", arrivalTime: "17:45" },
    ])
  })

  // The reason this reads the leg rather than the booking: bookings.route_reversed stays false
  // until a quote exists, so an enquiry-stage reversed journey would prefill the outbound times.
  it("uses the leg's own reversed flag, so a reversed journey prefills its real departure", () => {
    expect(buildSupplierRouteSchedules([leg({ route_reversed: true })])).toEqual([
      { supplierId: "supplier-train", departureTime: "10:15", arrivalTime: "19:00" },
    ])
  })

  it("keeps one entry per operator, first leg winning", () => {
    const schedules = buildSupplierRouteSchedules([
      leg(),
      leg({ route_reversed: true }),
      leg({ supplier_id: "supplier-other" }),
    ])
    expect(schedules).toEqual([
      { supplierId: "supplier-train", departureTime: "08:30", arrivalTime: "17:45" },
      { supplierId: "supplier-other", departureTime: "08:30", arrivalTime: "17:45" },
    ])
  })

  it("ignores legs that are not train operators", () => {
    expect(buildSupplierRouteSchedules([leg({ supplierKind: "hotel_property" })])).toEqual([])
    expect(buildSupplierRouteSchedules([leg({ supplierKind: null })])).toEqual([])
  })

  it("ignores legs with no supplier or no times captured", () => {
    expect(buildSupplierRouteSchedules([leg({ supplier_id: null })])).toEqual([])
    expect(buildSupplierRouteSchedules([leg({ route: null })])).toEqual([])
    expect(
      buildSupplierRouteSchedules([
        leg({
          route: {
            departure_time: null,
            arrival_time: null,
            return_departure_time: null,
            return_arrival_time: null,
          },
        }),
      ]),
    ).toEqual([])
  })

  it("keeps a leg that captured only one of the two times", () => {
    expect(
      buildSupplierRouteSchedules([leg({ route: { ...ROUTE, arrival_time: null } })]),
    ).toEqual([{ supplierId: "supplier-train", departureTime: "08:30", arrivalTime: null }])
  })
})

describe("routeHasReturnLeg", () => {
  it("is true only for two-way routes", () => {
    expect(routeHasReturnLeg("round_trip")).toBe(true)
    expect(routeHasReturnLeg("one_way")).toBe(false)
    expect(routeHasReturnLeg(null)).toBe(false)
    expect(routeHasReturnLeg(undefined)).toBe(false)
  })
})
