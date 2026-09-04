import { describe, expect, it } from "vitest"
import { isPlaceholderToken, resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { SYSTEM_TEMPLATE_KEYS, getTokenSpecs } from "@/lib/templates/registry"

/**
 * The quote, voucher and thank-you emails each override `direction`/`routeName` with their own
 * wording, and used to fall straight from "no quoted route" to the literal "your journey" -- which
 * threw away the shared resolver's answer. On a standalone stay (Kruger Shalati) that answer is the
 * stay's length, so a client was emailed "On the your journey departure, 20 November 2025".
 *
 * They now fall through to the shared token, guarded by this predicate so a booking that genuinely
 * resolved nothing still reads "your journey" rather than an em dash.
 */
describe("isPlaceholderToken", () => {
  it("treats the em-dash placeholder as nothing", () => {
    expect(isPlaceholderToken("—")).toBe(true)
    expect(isPlaceholderToken("  —  ")).toBe(true)
  })

  it("treats blank and absent values as nothing", () => {
    expect(isPlaceholderToken("")).toBe(true)
    expect(isPlaceholderToken("   ")).toBe(true)
    expect(isPlaceholderToken(null)).toBe(true)
    expect(isPlaceholderToken(undefined)).toBe(true)
  })

  it("keeps a real route name", () => {
    expect(isPlaceholderToken("Pretoria ↔ Cape Town")).toBe(false)
  })

  // What a standalone stay resolves to in place of a direction.
  it("keeps a stay length", () => {
    expect(isPlaceholderToken("2 Nights")).toBe(false)
    expect(isPlaceholderToken("1 Night")).toBe(false)
  })
})

/**
 * The registry is what the editor offers and what the preview samples; the resolver is what a real
 * send substitutes. A name present in one and not the other ships a literal "{{checkInDate}}" to a
 * client, which is exactly what renderTemplate's "Unreplaced token" warning exists to catch too
 * late. Driving a fully-failing client makes every value degrade to the placeholder, so this
 * asserts the token *names* line up without needing any booking data.
 */
describe("registry / resolver coverage", () => {
  const failing = {
    from() {
      throw new Error("no database in this test")
    },
  }

  it("resolves every token the registry advertises", async () => {
    const { tokens, blocks } = await resolveSharedEmailTokens(failing as never, "booking-1")
    const resolved = new Set([...Object.keys(tokens), ...Object.keys(blocks)])

    const missing = getTokenSpecs(SYSTEM_TEMPLATE_KEYS[0])
      .map((spec) => spec.name)
      .filter((name) => !resolved.has(name))

    expect(missing).toEqual([])
  })

  it("degrades every stay token to the placeholder rather than throwing", async () => {
    const { tokens } = await resolveSharedEmailTokens(failing as never, "booking-1")

    for (const name of ["checkInDate", "checkOutDate", "nights", "mealPlan", "propertyName", "roomType"]) {
      expect(isPlaceholderToken(tokens[name]), `${name} should be a placeholder`).toBe(true)
    }
  })
})

/**
 * Two tokens the registry advertised but that never carried what their name promised:
 * {{tripTitle}} was hardcoded to the placeholder, and {{departureDateShort}} was byte-identical to
 * {{departureDate}} despite sitting in the subject line where the month spelled out in full pushes
 * the useful part off the end.
 */
describe("tripTitle and departureDateShort", () => {
  function makeSupabase(rows: Record<string, unknown[]>) {
    return {
      from(table: string) {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          maybeSingle: async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null }),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
        }
        return builder
      },
    }
  }

  const booking = {
    id: "booking-1",
    booking_number: "LTT-2026-0001",
    customer_invoice_number: null,
    consultant: "Carla",
    departure_date: "2026-09-14",
    trip_end_date: null,
    no_of_adults: 2,
    no_of_children: 0,
    duration_nights: null,
    route_reversed: false,
    primary_supplier_id: null,
    customer: { title: "Mr", first_name: "John", last_name: "Smith", email: "j@example.com" },
    route: {
      name: "Pretoria to Cape Town",
      direction_mode: "one_way",
      origin: { name: "Pretoria" },
      destination: { name: "Cape Town" },
    },
  }

  it("abbreviates the month in departureDateShort but not in departureDate", async () => {
    const { tokens } = await resolveSharedEmailTokens(
      makeSupabase({ bookings: [booking] }) as never,
      "booking-1",
    )

    expect(tokens.departureDate).toBe("14 September 2026")
    expect(tokens.departureDateShort).toBe("14 Sep 2026")
  })

  it("uses the itinerary's own name for tripTitle when one exists", async () => {
    const { tokens } = await resolveSharedEmailTokens(
      makeSupabase({
        bookings: [booking],
        itineraries: [{ name: "Custom Honeymoon Title", created_at: "2026-08-01T00:00:00Z" }],
      }) as never,
      "booking-1",
    )

    expect(tokens.tripTitle).toBe("Custom Honeymoon Title")
  })

  it("falls back to the route and surname, matching the itinerary PDF's default", async () => {
    const { tokens } = await resolveSharedEmailTokens(
      makeSupabase({ bookings: [booking] }) as never,
      "booking-1",
    )

    expect(tokens.tripTitle).toBe("Pretoria → Cape Town — Smith Family")
  })

  // The nights fallback stands in for a route on a stay; it must not become a trip title.
  it("does not build a trip title out of a stay's night count", async () => {
    const { tokens } = await resolveSharedEmailTokens(
      makeSupabase({
        bookings: [{ ...booking, route: null, duration_nights: 3 }],
      }) as never,
      "booking-1",
    )

    expect(tokens.direction).toBe("3 Nights")
    expect(tokens.tripTitle).toBe("Smith Family")
  })
})
