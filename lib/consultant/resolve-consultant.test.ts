import { describe, expect, it } from "vitest"
import { resolveConsultant } from "@/lib/consultant/resolve-consultant"
import { createSupabaseMock } from "@/lib/testing/supabase-mock"

describe("resolveConsultant", () => {
  it("resolves a known abbreviation without touching profiles", () => {
    const { supabase } = createSupabaseMock()
    return resolveConsultant(supabase as never, { consultant: "LB", assigned_salesperson_id: null }).then(
      (result) => {
        expect(result).toEqual({ key: "LB", name: "Leonie" })
      },
    )
  })

  it("falls back to the assigned salesperson's profile when consultant is unset", async () => {
    const { supabase } = createSupabaseMock({
      profiles: [{ user_id: "u1", name: "Jane", surname: "Doe" }],
    })
    const result = await resolveConsultant(supabase as never, {
      consultant: null,
      assigned_salesperson_id: "u1",
    })
    expect(result).toEqual({ key: "JD", name: "Jane Doe" })
  })

  it("falls back to the profile when the stored abbreviation is unrecognized", async () => {
    const { supabase } = createSupabaseMock({
      profiles: [{ user_id: "u1", name: "Jane", surname: "Doe" }],
    })
    const result = await resolveConsultant(supabase as never, {
      consultant: "ZZ",
      assigned_salesperson_id: "u1",
    })
    expect(result).toEqual({ key: "JD", name: "Jane Doe" })
  })

  it("returns null when there is no consultant and no assigned salesperson", async () => {
    const { supabase } = createSupabaseMock()
    const result = await resolveConsultant(supabase as never, {
      consultant: null,
      assigned_salesperson_id: null,
    })
    expect(result).toBeNull()
  })

  it("returns null when the assigned salesperson has no profile row", async () => {
    const { supabase } = createSupabaseMock()
    const result = await resolveConsultant(supabase as never, {
      consultant: null,
      assigned_salesperson_id: "missing",
    })
    expect(result).toBeNull()
  })
})
