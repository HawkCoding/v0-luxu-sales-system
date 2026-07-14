import { describe, expect, it } from "vitest"

import { joinLocalDateTime, normalizeTimeInput, splitLocalDateTime } from "./date-time-field"

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

describe("splitLocalDateTime / joinLocalDateTime", () => {
  it("round-trips a timestamp through its local parts", () => {
    const iso = joinLocalDateTime("2026-07-15", "14:30")
    expect(iso).not.toBeNull()

    const parts = splitLocalDateTime(iso)
    expect(parts).toEqual({ date: "2026-07-15", time: "14:30" })
  })

  it("treats a missing time as midnight", () => {
    const iso = joinLocalDateTime("2026-07-15", "")
    expect(splitLocalDateTime(iso)).toEqual({ date: "2026-07-15", time: "00:00" })
  })

  it("returns null when there is no date to anchor the time to", () => {
    expect(joinLocalDateTime("", "14:30")).toBeNull()
  })

  it("returns empty parts for null and unparseable input", () => {
    expect(splitLocalDateTime(null)).toEqual({ date: "", time: "" })
    expect(splitLocalDateTime("not a timestamp")).toEqual({ date: "", time: "" })
  })
})
