import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { extractDirectionLocationIds, findRouteId } from "@/lib/resolvers/route-resolver"

const LOCATIONS = [
  { id: "loc-pretoria", name: "Pretoria" },
  { id: "loc-cape-town", name: "Cape Town" },
  { id: "loc-durban", name: "Durban" },
]

describe("extractDirectionLocationIds", () => {
  it("orders endpoints by first appearance", () => {
    expect(extractDirectionLocationIds("Pretoria to Cape Town", LOCATIONS)).toEqual([
      "loc-pretoria",
      "loc-cape-town",
    ])
  })

  it("prefers the longer location name over a bare substring token", () => {
    // "Cape Town" must win as a whole match rather than accidentally matching on a shorter name.
    expect(extractDirectionLocationIds("Cape Town to Durban", LOCATIONS)).toEqual([
      "loc-cape-town",
      "loc-durban",
    ])
  })

  it("returns null when fewer than two distinct locations are named", () => {
    expect(extractDirectionLocationIds("Somewhere nice", LOCATIONS)).toBeNull()
    expect(extractDirectionLocationIds("Just Pretoria", LOCATIONS)).toBeNull()
  })
})

describe("findRouteId", () => {
  function mockWith(routes: Array<Record<string, unknown>>) {
    return createSupabaseMock({ locations: LOCATIONS, routes })
  }

  it("resolves an unambiguous one_way route", async () => {
    const { supabase } = mockWith([
      {
        id: "route-1",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
    ])

    const routeId = await findRouteId(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(routeId).toBe("route-1")
  })

  it("never guesses: two candidate routes for the same endpoint pair resolve to null, even with a known supplier", async () => {
    // Regression test for the removed `matches[0]` fallback -- a duplicate/ambiguous route must
    // not be silently resolved to whichever row the query happens to return first.
    const { supabase } = mockWith([
      {
        id: "route-1",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
      {
        id: "route-2",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
    ])

    const routeId = await findRouteId(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(routeId).toBeNull()
  })

  it("never guesses without a known supplier either", async () => {
    const { supabase } = mockWith([
      {
        id: "route-1",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
      {
        id: "route-2",
        supplier_id: "supplier-2",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
    ])

    const routeId = await findRouteId(supabase as never, "Pretoria to Cape Town", null)
    expect(routeId).toBeNull()
  })

  it("matches round_trip routes regardless of endpoint order", async () => {
    const { supabase } = mockWith([
      {
        id: "route-1",
        supplier_id: "supplier-1",
        origin_location_id: "loc-cape-town",
        destination_location_id: "loc-pretoria",
        direction_mode: "round_trip",
        active: true,
      },
    ])

    const routeId = await findRouteId(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(routeId).toBe("route-1")
  })

  it("returns null when the direction can't be decomposed into two endpoints", async () => {
    const { supabase } = mockWith([])
    const routeId = await findRouteId(supabase as never, "somewhere unspecified", null)
    expect(routeId).toBeNull()
  })

  it("returns null for a blank or non-string direction", async () => {
    const { supabase } = mockWith([])
    expect(await findRouteId(supabase as never, "", null)).toBeNull()
    expect(await findRouteId(supabase as never, undefined, null)).toBeNull()
  })
})
