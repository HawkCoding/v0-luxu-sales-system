import { describe, expect, it } from "vitest"
import { resolveRouteSchedule, routeHasReturnLeg, toHoursMinutes } from "@/lib/routes/route-schedule"

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

describe("routeHasReturnLeg", () => {
  it("is true only for two-way routes", () => {
    expect(routeHasReturnLeg("round_trip")).toBe(true)
    expect(routeHasReturnLeg("one_way")).toBe(false)
    expect(routeHasReturnLeg(null)).toBe(false)
    expect(routeHasReturnLeg(undefined)).toBe(false)
  })
})
