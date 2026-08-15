import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { extractDirectionLocationIds, findRouteId, findRouteMatch } from "@/lib/resolvers/route-resolver"

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

  it("resolves no route at all when no supplier is known", async () => {
    const { supabase } = mockWith([
      {
        id: "route-1",
        name: "African Collage Tour",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
      {
        id: "route-2",
        name: "Cape Town Journey",
        supplier_id: "supplier-2",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "round_trip",
        active: true,
      },
    ])

    // Choosing between two OPERATORS is a guess, not a tie-break: the old behaviour handed an
    // enquiry that named no operator whichever supplier's route sorted first.
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

describe("findRouteMatch", () => {
  function mockWith(routes: Array<Record<string, unknown>>) {
    return createSupabaseMock({ locations: LOCATIONS, routes })
  }

  it("flags reversed when a round_trip route is named destination-first", async () => {
    // Route is filed Pretoria -> Cape Town; the enquiry said "Cape Town to Pretoria".
    const { supabase } = mockWith([
      {
        id: "route-1",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "round_trip",
        active: true,
      },
    ])

    const match = await findRouteMatch(supabase as never, "Cape Town to Pretoria", "supplier-1")
    expect(match).toEqual({ routeId: "route-1", reversed: true })
  })

  it("is not reversed when named in the route's filed order", async () => {
    const { supabase } = mockWith([
      {
        id: "route-1",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "round_trip",
        active: true,
      },
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match).toEqual({ routeId: "route-1", reversed: false })
  })

  it("is never reversed for a one_way route", async () => {
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

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match).toEqual({ routeId: "route-1", reversed: false })
  })

  it("returns no match when nothing shares the endpoint pair", async () => {
    const { supabase } = mockWith([
      {
        id: "route-1",
        name: "Durban Safari",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-durban",
        direction_mode: "round_trip",
        active: true,
      },
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match).toEqual({ routeId: null, reversed: false })
  })

  it("still computes reversed off the route the tie-break chose, not the first row", async () => {
    // Filed Cape Town -> Pretoria; the enquiry named Pretoria first, so the chosen round_trip
    // route is travelled reversed. The one_way row would have yielded reversed: false.
    const { supabase } = mockWith([
      {
        id: "route-one-way",
        name: "African Collage Tour",
        supplier_id: "supplier-1",
        origin_location_id: "loc-pretoria",
        destination_location_id: "loc-cape-town",
        direction_mode: "one_way",
        active: true,
      },
      {
        id: "route-round-trip",
        name: "Cape Town Journey",
        supplier_id: "supplier-1",
        origin_location_id: "loc-cape-town",
        destination_location_id: "loc-pretoria",
        direction_mode: "round_trip",
        active: true,
      },
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match).toEqual({ routeId: "route-round-trip", reversed: true })
  })
})

describe("findRouteMatch tie-break", () => {
  function mockWith(routes: Array<Record<string, unknown>>) {
    return createSupabaseMock({ locations: LOCATIONS, routes })
  }

  function pretoriaToCapeTown(overrides: Record<string, unknown>) {
    return {
      supplier_id: "supplier-1",
      origin_location_id: "loc-pretoria",
      destination_location_id: "loc-cape-town",
      active: true,
      ...overrides,
    }
  }

  it("prefers round_trip over one_way", async () => {
    // The real Rovos collision: "Cape Town Journey" (round_trip) vs "African Collage Tour"
    // (one_way) share Pretoria -> Cape Town.
    const { supabase } = mockWith([
      pretoriaToCapeTown({ id: "one-way", name: "African Collage Tour", direction_mode: "one_way" }),
      pretoriaToCapeTown({ id: "round-trip", name: "Cape Town Journey", direction_mode: "round_trip" }),
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match.routeId).toBe("round-trip")
  })

  it("prefers the shorter duration when the direction mode ties", async () => {
    const { supabase } = mockWith([
      pretoriaToCapeTown({ id: "long", name: "A Long Journey", direction_mode: "round_trip", duration_days: 5 }),
      pretoriaToCapeTown({ id: "short", name: "Z Short Journey", direction_mode: "round_trip", duration_days: 3 }),
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match.routeId).toBe("short")
  })

  it("sorts an unset duration last", async () => {
    const { supabase } = mockWith([
      pretoriaToCapeTown({ id: "unset", name: "A Journey", direction_mode: "round_trip", duration_days: null }),
      pretoriaToCapeTown({ id: "known", name: "Z Journey", direction_mode: "round_trip", duration_days: 9 }),
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match.routeId).toBe("known")
  })

  it("falls back to name A-Z when mode and duration both tie", async () => {
    const { supabase } = mockWith([
      pretoriaToCapeTown({ id: "zulu", name: "Zulu Journey", direction_mode: "round_trip", duration_days: 4 }),
      pretoriaToCapeTown({ id: "alpha", name: "alpha journey", direction_mode: "round_trip", duration_days: 4 }),
    ])

    const match = await findRouteMatch(supabase as never, "Pretoria to Cape Town", "supplier-1")
    expect(match.routeId).toBe("alpha")
  })
})
