import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"
import { resolveTrainSupplierId, findHotelSupplierId } from "@/lib/resolvers/supplier-resolver"

describe("resolveTrainSupplierId", () => {
  it("resolves an exact (filler-stripped) match", async () => {
    const { supabase } = createSupabaseMock({
      suppliers: [
        { id: "sup-1", name: "The Blue Train", kind: "train_operator", active: true },
        { id: "sup-2", name: "Rovos Rail", kind: "train_operator", active: true },
      ],
    })

    expect(await resolveTrainSupplierId(supabase as never, "Blue Train")).toBe("sup-1")
    expect(await resolveTrainSupplierId(supabase as never, "Rovos Rail")).toBe("sup-2")
  })

  it("never guesses: two suppliers sharing a normalized name resolve to null rather than picking the first row", async () => {
    const { supabase } = createSupabaseMock({
      suppliers: [
        { id: "sup-1", name: "Rovos Rail", kind: "train_operator", active: true },
        { id: "sup-2", name: "Rovos Rail", kind: "train_operator", active: true },
      ],
    })

    expect(await resolveTrainSupplierId(supabase as never, "Rovos Rail")).toBeNull()
  })

  it("does not resolve a partial mention below the confidence floor", async () => {
    const { supabase } = createSupabaseMock({
      suppliers: [{ id: "sup-1", name: "The Blue Train", kind: "train_operator", active: true }],
    })

    // "Blue" alone only covers half of "Blue Train"'s tokens -- below the accept threshold.
    expect(await resolveTrainSupplierId(supabase as never, "Blue")).toBeNull()
  })

  it("ignores inactive suppliers and suppliers of a different kind", async () => {
    const { supabase } = createSupabaseMock({
      suppliers: [
        { id: "sup-1", name: "Rovos Rail", kind: "train_operator", active: false },
        { id: "sup-2", name: "Rovos Rail", kind: "hotel_property", active: true },
      ],
    })

    expect(await resolveTrainSupplierId(supabase as never, "Rovos Rail")).toBeNull()
  })

  it("returns null for blank or non-string input", async () => {
    const { supabase } = createSupabaseMock({ suppliers: [] })
    expect(await resolveTrainSupplierId(supabase as never, "")).toBeNull()
    expect(await resolveTrainSupplierId(supabase as never, undefined)).toBeNull()
  })
})

describe("findHotelSupplierId", () => {
  it("resolves an exact match among hotel_property suppliers", async () => {
    const { supabase } = createSupabaseMock({
      suppliers: [{ id: "hotel-1", name: "Apogee Boutique Hotel and Spa", kind: "hotel_property", active: true }],
    })

    expect(await findHotelSupplierId(supabase as never, "Apogee Boutique Hotel and Spa")).toBe("hotel-1")
  })

  it("never guesses on ambiguous wording", async () => {
    const { supabase } = createSupabaseMock({
      suppliers: [
        { id: "hotel-1", name: "Taj Hotel", kind: "hotel_property", active: true },
        { id: "hotel-2", name: "Taj Hotel", kind: "hotel_property", active: true },
      ],
    })

    expect(await findHotelSupplierId(supabase as never, "Taj Hotel")).toBeNull()
  })
})
