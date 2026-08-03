import { describe, expect, it } from "vitest"

import { buildRouteName, resolveDirectedArrivalName, resolveDirectedRouteName } from "@/lib/routes/route-name"

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

describe("resolveDirectedRouteName", () => {
  it("renders origin → destination when not reversed", () => {
    expect(resolveDirectedRouteName("Pretoria", "Cape Town", false)).toBe("Pretoria → Cape Town")
  })

  it("swaps the endpoints when reversed", () => {
    expect(resolveDirectedRouteName("Pretoria", "Cape Town", true)).toBe("Cape Town → Pretoria")
  })

  it("always renders a one-way arrow, never the two-way glyph", () => {
    expect(resolveDirectedRouteName("Pretoria", "Cape Town", false)).not.toContain("↔")
    expect(resolveDirectedRouteName("Pretoria", "Cape Town", true)).not.toContain("↔")
  })
})

describe("resolveDirectedArrivalName", () => {
  it("arrives at the destination when not reversed", () => {
    expect(resolveDirectedArrivalName("Pretoria", "Cape Town", false)).toBe("Cape Town")
  })

  it("arrives at the origin when reversed, e.g. a round trip's return leg", () => {
    expect(resolveDirectedArrivalName("Pretoria", "Cape Town", true)).toBe("Pretoria")
  })
})
