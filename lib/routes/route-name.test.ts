import { describe, expect, it } from "vitest"

import {
  buildRouteName,
  parseRouteEndpointCodes,
  resolveDirectedArrivalName,
  resolveDirectedEndpointCodes,
  resolveDirectedRouteName,
} from "@/lib/routes/route-name"

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

describe("parseRouteEndpointCodes", () => {
  it("reads a code pair separated by '>'", () => {
    expect(parseRouteEndpointCodes("CPT > ORT")).toEqual({ departure: "CPT", arrival: "ORT" })
  })

  it("reads a code pair with no surrounding spaces", () => {
    expect(parseRouteEndpointCodes("DUR>ORT")).toEqual({ departure: "DUR", arrival: "ORT" })
  })

  it("uppercases lower-case codes", () => {
    expect(parseRouteEndpointCodes("cpt→ort")).toEqual({ departure: "CPT", arrival: "ORT" })
  })

  it("accepts other separators", () => {
    expect(parseRouteEndpointCodes("CPT / ORT")).toEqual({ departure: "CPT", arrival: "ORT" })
    expect(parseRouteEndpointCodes("CPT - ORT")).toEqual({ departure: "CPT", arrival: "ORT" })
    expect(parseRouteEndpointCodes("CPT to ORT")).toEqual({ departure: "CPT", arrival: "ORT" })
  })

  it("accepts 4-letter ICAO codes", () => {
    expect(parseRouteEndpointCodes("FALA - FACT")).toEqual({ departure: "FALA", arrival: "FACT" })
  })

  it("rejects a prose route name", () => {
    expect(parseRouteEndpointCodes("Cape Town to Johannesburg")).toBeNull()
  })

  it("rejects a code that is too short", () => {
    expect(parseRouteEndpointCodes("CT > ORT")).toBeNull()
  })

  it("rejects a resolved location-name route", () => {
    expect(parseRouteEndpointCodes("Cape Town INT Airport → OR Tambo INT Airport")).toBeNull()
  })

  it("rejects a name with no separator", () => {
    expect(parseRouteEndpointCodes("CPTORT")).toBeNull()
  })

  it("rejects empty and nullish input", () => {
    expect(parseRouteEndpointCodes("")).toBeNull()
    expect(parseRouteEndpointCodes(null)).toBeNull()
    expect(parseRouteEndpointCodes(undefined)).toBeNull()
  })
})

describe("resolveDirectedEndpointCodes", () => {
  it("returns the pair as-is when not reversed", () => {
    expect(resolveDirectedEndpointCodes("CPT > ORT", false)).toEqual({
      departure: "CPT",
      arrival: "ORT",
    })
  })

  it("swaps the pair when reversed", () => {
    expect(resolveDirectedEndpointCodes("CPT > ORT", true)).toEqual({
      departure: "ORT",
      arrival: "CPT",
    })
  })

  it("returns null for an unparseable route name regardless of direction", () => {
    expect(resolveDirectedEndpointCodes("Cape Town to Johannesburg", true)).toBeNull()
  })
})
