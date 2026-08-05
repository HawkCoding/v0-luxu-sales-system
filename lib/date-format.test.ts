import { describe, expect, it } from "vitest"

import {
  formatDayOfMonth,
  formatDisplayDate,
  formatDisplayDateLong,
  formatDisplayDateShort,
  formatDisplayDateTime,
  normalizeDateOfBirth,
} from "./date-format"

describe("formatDisplayDate", () => {
  it("formats an ISO date as zero-padded day/month/year", () => {
    expect(formatDisplayDate("2026-03-07")).toBe("07/03/2026")
  })

  it("zero-pads both day and month for single-digit values", () => {
    expect(formatDisplayDate("2026-01-02")).toBe("02/01/2026")
  })

  it("does not shift the day across timezones for date-only input", () => {
    expect(formatDisplayDate("2026-12-31")).toBe("31/12/2026")
  })

  it("accepts a Date instance", () => {
    expect(formatDisplayDate(new Date(2026, 6, 4))).toBe("04/07/2026")
  })

  it("returns an empty string for null, undefined, and unparseable input", () => {
    expect(formatDisplayDate(null)).toBe("")
    expect(formatDisplayDate(undefined)).toBe("")
    expect(formatDisplayDate("not a date")).toBe("")
  })
})

describe("formatDisplayDateTime", () => {
  it("appends zero-padded 24-hour time to the date", () => {
    expect(formatDisplayDateTime(new Date(2026, 6, 4, 9, 5))).toBe("04/07/2026 09:05")
  })

  it("returns an empty string for null input", () => {
    expect(formatDisplayDateTime(null)).toBe("")
  })
})

describe("formatDisplayDateLong", () => {
  it("formats as zero-padded day, spelled-out month, year", () => {
    expect(formatDisplayDateLong("2026-07-04")).toBe("04 July 2026")
  })

  it("leaves a two-digit day alone", () => {
    expect(formatDisplayDateLong("2026-07-18")).toBe("18 July 2026")
  })

  it("returns an empty string for null input", () => {
    expect(formatDisplayDateLong(null)).toBe("")
  })
})

describe("formatDisplayDateShort", () => {
  it("formats as zero-padded day, abbreviated month, year", () => {
    expect(formatDisplayDateShort("2026-07-04")).toBe("04 Jul 2026")
  })

  it("leaves a two-digit day alone", () => {
    expect(formatDisplayDateShort("2026-07-18")).toBe("18 Jul 2026")
  })
})

describe("normalizeDateOfBirth", () => {
  it("passes an already-ISO date through", () => {
    expect(normalizeDateOfBirth("1980-05-12")).toBe("1980-05-12")
  })

  it("reads a slashed numeric date as day/month/year", () => {
    expect(normalizeDateOfBirth("12/05/1980")).toBe("1980-05-12")
  })

  it("accepts dot and dash separators", () => {
    expect(normalizeDateOfBirth("12-05-1980")).toBe("1980-05-12")
    expect(normalizeDateOfBirth("12.05.1980")).toBe("1980-05-12")
  })

  it("zero-pads single-digit day and month", () => {
    expect(normalizeDateOfBirth("2/5/1980")).toBe("1980-05-02")
  })

  it("accepts abbreviated and full month names", () => {
    expect(normalizeDateOfBirth("14 Feb 1990")).toBe("1990-02-14")
    expect(normalizeDateOfBirth("14 February 1990")).toBe("1990-02-14")
    expect(normalizeDateOfBirth("14-feb-1990")).toBe("1990-02-14")
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeDateOfBirth("  1980-05-12  ")).toBe("1980-05-12")
  })

  it("rejects impossible calendar dates", () => {
    expect(normalizeDateOfBirth("31/02/1980")).toBeNull()
    expect(normalizeDateOfBirth("1980-13-01")).toBeNull()
    expect(normalizeDateOfBirth("00/05/1980")).toBeNull()
  })

  it("rejects unparseable input rather than guessing", () => {
    expect(normalizeDateOfBirth("sometime in 1980")).toBeNull()
    expect(normalizeDateOfBirth("12/05/80")).toBeNull()
    expect(normalizeDateOfBirth("14 Smarch 1990")).toBeNull()
  })

  it("returns null for blank or missing input", () => {
    expect(normalizeDateOfBirth("")).toBeNull()
    expect(normalizeDateOfBirth("   ")).toBeNull()
    expect(normalizeDateOfBirth(null)).toBeNull()
    expect(normalizeDateOfBirth(undefined)).toBeNull()
  })

  it("returns an empty string for null input", () => {
    expect(formatDisplayDateShort(null)).toBe("")
  })
})

describe("formatDayOfMonth", () => {
  it("zero-pads a single-digit day", () => {
    expect(formatDayOfMonth("2026-07-04")).toBe("04")
  })

  it("returns an empty string for null input", () => {
    expect(formatDayOfMonth(null)).toBe("")
  })
})
