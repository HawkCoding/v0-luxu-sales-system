import { describe, expect, it, vi } from "vitest"
import { resolvePayingPax } from "@/lib/invoices/booking-pax"

/** app_settings answers the house age buckets; suppliers answers one supplier's override. */
function fakeSupabase(options: {
  defaults?: { infant: string; child: string }
  supplier?: { infant_max_age: number | null; child_max_age: number | null } | null
  settingsError?: boolean
}) {
  return {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(async () =>
          options.settingsError
            ? { data: null, error: { message: "boom" } }
            : {
                data: options.defaults
                  ? [
                      { key: "default_infant_max_age", value: options.defaults.infant },
                      { key: "default_child_max_age", value: options.defaults.child },
                    ]
                  : [],
                error: null,
              },
        ),
        maybeSingle: vi.fn(async () => ({ data: table === "suppliers" ? (options.supplier ?? null) : null, error: null })),
      }
      return chain
    }),
  }
}

describe("resolvePayingPax", () => {
  const booking = { no_of_adults: 2, no_of_children: 3, child_ages: [1, 8, 15] }

  it("drops the infant and counts the over-age child as an adult", async () => {
    const supabase = fakeSupabase({ defaults: { infant: "2", child: "12" } })
    expect(await resolvePayingPax(supabase as never, booking, null)).toEqual({ adults: 3, children: 1 })
  })

  it("buckets by the primary supplier's own ages", async () => {
    // This operator charges children up to 16, so the 15-year-old stays a child.
    const supabase = fakeSupabase({
      defaults: { infant: "2", child: "12" },
      supplier: { infant_max_age: 2, child_max_age: 16 },
    })
    expect(await resolvePayingPax(supabase as never, booking, "supplier-1")).toEqual({ adults: 2, children: 2 })
  })

  it("falls back to the house defaults when the age settings can't be read", async () => {
    const supabase = fakeSupabase({ settingsError: true })
    expect(await resolvePayingPax(supabase as never, booking, null)).toEqual({ adults: 3, children: 1 })
  })

  it("keeps the raw counts when no child ages were captured, and returns zeros without a booking", async () => {
    const supabase = fakeSupabase({ defaults: { infant: "2", child: "12" } })
    expect(
      await resolvePayingPax(supabase as never, { no_of_adults: 4, no_of_children: 1, child_ages: null }, null),
    ).toEqual({ adults: 4, children: 1 })
    expect(await resolvePayingPax(supabase as never, null, null)).toEqual({ adults: 0, children: 0 })
  })
})
