import { describe, expect, it } from "vitest"

import { buildRouteName } from "@/lib/routes/route-name"

describe("buildRouteName", () => {
  it("uses a single arrow for one-way routes", () => {
    expect(buildRouteName("Pretoria", "Cape Town", "one_way")).toBe("Pretoria → Cape Town")
  })

  it("uses a double arrow for round-trip routes", () => {
    expect(buildRouteName("Pretoria", "Cape Town", "round_trip")).toBe("Pretoria ↔ Cape Town")
  })

  it("trims endpoint names", () => {
    expect(buildRouteName("  Pretoria  ", " Cape Town ", "round_trip")).toBe(
      "Pretoria ↔ Cape Town",
    )
  })

  it("preserves multi-word location names", () => {
    expect(buildRouteName("Cape Town", "Dar es Salaam", "round_trip")).toBe(
      "Cape Town ↔ Dar es Salaam",
    )
  })
})
