import { describe, expect, it } from "vitest"

import {
  COUNTRIES,
  DIRECTIONS,
  HOTEL_OPTIONS,
  SUITE_TYPES,
  getHotelRegionForDirection,
} from "./form-data"

describe("getHotelRegionForDirection", () => {
  it("maps directions to the correct hotel region", () => {
    expect(getHotelRegionForDirection("Pretoria to Cape Town")).toBe("CPT")
    expect(getHotelRegionForDirection("Pretoria to Durban")).toBe("DBN")
    expect(getHotelRegionForDirection("Cape Town to Dar es Salaam")).toBe("TZN")
    expect(getHotelRegionForDirection("Pretoria to Swakopmund")).toBe("NAM")
    expect(getHotelRegionForDirection("Victoria Falls to Pretoria")).toBe("Vic Falls")
    expect(getHotelRegionForDirection("Johannesburg to Pretoria")).toBe("PTY")
  })
})

describe("form-data constants", () => {
  it("includes expected directions and suite types", () => {
    expect(DIRECTIONS).toContain("Pretoria to Cape Town")
    expect(DIRECTIONS).toContain("Dar es Salaam to Cape Town")
    expect(SUITE_TYPES).toContain("Royal Double Suite")
    expect(SUITE_TYPES).toContain("Pullman Twin Suite")
  })

  it("includes expected countries and hotel options", () => {
    expect(COUNTRIES).toContain("South Africa")
    expect(COUNTRIES).toContain("Other")
    expect(HOTEL_OPTIONS.CPT).toContain("Commodore Hotel - Waterfront")
    expect(HOTEL_OPTIONS["Vic Falls"]).toContain("The Victoria Falls Hotel")
  })
})
