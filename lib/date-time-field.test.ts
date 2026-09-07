import { describe, expect, it } from "vitest"

import { joinAppZoneDateTime, normalizeTimeInput, splitAppZoneDateTime } from "./date-time-field"

describe("normalizeTimeInput", () => {
  it("passes through a well-formed 24-hour time", () => {
    expect(normalizeTimeInput("14:30")).toBe("14:30")
  })

  it("zero-pads single-digit hours and minutes", () => {
    expect(normalizeTimeInput("9:5")).toBe("09:05")
  })

  it("reads bare digits as hhmm", () => {
    expect(normalizeTimeInput("930")).toBe("09:30")
    expect(normalizeTimeInput("0930")).toBe("09:30")
    expect(normalizeTimeInput("1430")).toBe("14:30")
  })

  it("reads one or two bare digits as a whole hour", () => {
    expect(normalizeTimeInput("9")).toBe("09:00")
    expect(normalizeTimeInput("14")).toBe("14:00")
  })

  it("keeps midnight rather than treating it as empty", () => {
    expect(normalizeTimeInput("00:00")).toBe("00:00")
    expect(normalizeTimeInput("0")).toBe("00:00")
  })

  it("rejects out-of-range values instead of clamping them", () => {
    expect(normalizeTimeInput("25:00")).toBe("")
    expect(normalizeTimeInput("12:60")).toBe("")
  })

  it("returns an empty string for junk and blanks", () => {
    expect(normalizeTimeInput("")).toBe("")
    expect(normalizeTimeInput(null)).toBe("")
    expect(normalizeTimeInput("abc")).toBe("")
    expect(normalizeTimeInput("12345")).toBe("")
  })
})

describe("splitAppZoneDateTime / joinAppZoneDateTime", () => {
  it("round-trips a timestamp through its APP_TIME_ZONE parts", () => {
    const iso = joinAppZoneDateTime("2026-07-15", "14:30")
    expect(iso).not.toBeNull()

    const parts = splitAppZoneDateTime(iso)
    expect(parts).toEqual({ date: "2026-07-15", time: "14:30" })
  })

  it("treats a missing time as midnight", () => {
    const iso = joinAppZoneDateTime("2026-07-15", "")
    expect(splitAppZoneDateTime(iso)).toEqual({ date: "2026-07-15", time: "00:00" })
  })

  it("returns null when there is no date to anchor the time to", () => {
    expect(joinAppZoneDateTime("", "14:30")).toBeNull()
  })

  it("returns empty parts for null and unparseable input", () => {
    expect(splitAppZoneDateTime(null)).toEqual({ date: "", time: "" })
    expect(splitAppZoneDateTime("not a timestamp")).toEqual({ date: "", time: "" })
  })

  // A fixed expectation, not a round-trip -- this is the one that fails on a UTC (or any
  // non-SAST) CI/dev box if the write path regresses back to the browser's local clock (F-P3-5).
  it("resolves a 00:00 SAST pickup to the previous day in UTC regardless of process timezone", () => {
    expect(joinAppZoneDateTime("2026-11-18", "00:00")).toBe("2026-11-17T22:00:00.000Z")
  })
})
