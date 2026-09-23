import { describe, expect, it } from "vitest"
import { legOrderChanged, resolveServiceTiming, sortLegsByDate, type DatedLeg } from "./sort-legs-by-date"

function leg(partial: Partial<DatedLeg> & { id: string }): DatedLeg {
  return { date: null, time: null, sortOrder: 0, ...partial }
}

describe("sortLegsByDate", () => {
  it("sorts legs into date order regardless of their starting sort_order", () => {
    const legs = [
      leg({ id: "hotel", date: "2026-06-05", sortOrder: 0 }),
      leg({ id: "train", date: "2026-06-01", sortOrder: 1 }),
      leg({ id: "transfer", date: "2026-06-03", sortOrder: 2 }),
    ]

    expect(sortLegsByDate(legs).map((l) => l.id)).toEqual(["train", "transfer", "hotel"])
  })

  it("puts undated legs last, in the salesperson's own order", () => {
    const legs = [
      leg({ id: "extra-b", date: null, sortOrder: 0 }),
      leg({ id: "train", date: "2026-06-01", sortOrder: 1 }),
      leg({ id: "extra-a", date: null, sortOrder: 2 }),
    ]

    expect(sortLegsByDate(legs).map((l) => l.id)).toEqual(["train", "extra-b", "extra-a"])
  })

  it("keeps the salesperson's own order for two legs on the same day with no times", () => {
    const legs = [
      leg({ id: "hotel", date: "2026-06-01", sortOrder: 0 }),
      leg({ id: "train", date: "2026-06-01", sortOrder: 1 }),
    ]

    // Same day, neither states a time -- sort_order (the user's arrow order) is the stable
    // tiebreak, never guessed clock order.
    expect(sortLegsByDate(legs).map((l) => l.id)).toEqual(["hotel", "train"])
  })

  it("orders same-day legs that each state a real time by that time", () => {
    const legs = [
      leg({ id: "evening-transfer", date: "2026-06-01", time: "18:00", sortOrder: 0 }),
      leg({ id: "morning-transfer", date: "2026-06-01", time: "07:30", sortOrder: 1 }),
    ]

    expect(sortLegsByDate(legs).map((l) => l.id)).toEqual(["morning-transfer", "evening-transfer"])
  })

  it("never lets a timed leg jump past an untimed leg on the same day", () => {
    const legs = [
      leg({ id: "hotel-checkin", date: "2026-06-01", time: null, sortOrder: 0 }),
      leg({ id: "afternoon-transfer", date: "2026-06-01", time: "15:00", sortOrder: 1 }),
    ]

    // The hotel's "check-in from" is not a comparable clock event, so it keeps its slot -- only
    // the timed legs among themselves get reordered.
    expect(sortLegsByDate(legs).map((l) => l.id)).toEqual(["hotel-checkin", "afternoon-transfer"])
  })

  it("is a no-op for a booking already built in date order", () => {
    const legs = [
      leg({ id: "train", date: "2026-06-01", sortOrder: 0 }),
      leg({ id: "hotel", date: "2026-06-05", sortOrder: 1 }),
    ]

    expect(sortLegsByDate(legs).map((l) => l.id)).toEqual(["train", "hotel"])
  })
})

describe("legOrderChanged", () => {
  it("is false when the id sequence is identical", () => {
    const a = [{ id: "1" }, { id: "2" }]
    const b = [{ id: "1" }, { id: "2" }]
    expect(legOrderChanged(a, b)).toBe(false)
  })

  it("is true when the id sequence differs", () => {
    const a = [{ id: "1" }, { id: "2" }]
    const b = [{ id: "2" }, { id: "1" }]
    expect(legOrderChanged(a, b)).toBe(true)
  })
})

describe("resolveServiceTiming", () => {
  it("reads a suite leg's date straight off service_date", () => {
    expect(resolveServiceTiming({ kind: "hotel_property", serviceDate: "2026-06-05" })).toEqual({
      date: "2026-06-05",
      time: null,
    })
  })

  it("reads an airline leg's time off departure_time", () => {
    expect(
      resolveServiceTiming({ kind: "airline", serviceDate: "2026-06-05", departureTime: "09:15:00" }),
    ).toEqual({ date: "2026-06-05", time: "09:15" })
  })

  it("dates a transfer by its earliest linked pickup, in APP_TIME_ZONE", () => {
    const result = resolveServiceTiming({
      kind: "transfers",
      serviceDate: null,
      pickupAts: ["2026-06-02T14:00:00Z", "2026-06-01T04:00:00Z"],
    })
    expect(result.date).toBe("2026-06-01")
  })

  it("treats a transfer pickup stored at exactly midnight as no time typed", () => {
    // joinAppZoneDateTime writes 00:00 for "date picked, no time typed" -- that must not read as
    // a real midnight pickup that jumps ahead of a same-day timed leg.
    const result = resolveServiceTiming({
      kind: "transfers",
      serviceDate: null,
      pickupAts: ["2026-05-31T22:00:00Z"], // 00:00 SAST
    })
    expect(result.time).toBeNull()
  })

  it("returns no date for a transfer with no linked requests", () => {
    expect(resolveServiceTiming({ kind: "transfers", serviceDate: null, pickupAts: [] })).toEqual({
      date: null,
      time: null,
    })
  })
})
