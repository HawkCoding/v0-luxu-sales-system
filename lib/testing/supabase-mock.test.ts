import { describe, expect, it } from "vitest"
import { createSupabaseMock } from "./supabase-mock"

describe("createSupabaseMock", () => {
  it("inserts a row and returns it via select().single() with generated id and timestamps", async () => {
    const { supabase, store } = createSupabaseMock({ quotes: [] })

    const { data, error } = await supabase
      .from("quotes")
      .insert({ booking_id: "booking-1", status: "draft", total: 0 })
      .select("id, booking_id, status")
      .single()

    expect(error).toBeNull()
    expect(data).toEqual(
      expect.objectContaining({ id: "quotes-1", booking_id: "booking-1", status: "draft" }),
    )
    expect(store.rows("quotes")).toHaveLength(1)
    expect(store.rows("quotes")[0]).toHaveProperty("created_at")
  })

  it("filters with eq and resolves an array when awaited directly", async () => {
    const { supabase } = createSupabaseMock({
      payments: [
        { id: "p1", booking_id: "b1", amount: 250 },
        { id: "p2", booking_id: "b1", amount: 750 },
        { id: "p3", booking_id: "b2", amount: 100 },
      ],
    })

    const { data } = await supabase.from("payments").select("amount").eq("booking_id", "b1")

    expect(data).toHaveLength(2)
  })

  it("applies order + limit + maybeSingle to return the newest matching row", async () => {
    const { supabase } = createSupabaseMock({
      quotes: [
        { id: "q1", booking_id: "b1", status: "accepted", total: 1000, created_at: "2026-05-01T00:00:00.000Z" },
        { id: "q2", booking_id: "b1", status: "accepted", total: 1200, created_at: "2026-05-05T00:00:00.000Z" },
        { id: "q3", booking_id: "b1", status: "sent", total: 1300, created_at: "2026-05-09T00:00:00.000Z" },
      ],
    })

    const { data } = await supabase
      .from("quotes")
      .select("id, total")
      .eq("booking_id", "b1")
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    expect(data).toMatchObject({ id: "q2", total: 1200 })
  })

  it("resolves single-level embeds via the <alias>_id foreign key", async () => {
    const { supabase } = createSupabaseMock({
      bookings: [{ id: "b1", booking_number: "BT-2026-0001", customer_id: "c1" }],
      customers: [{ id: "c1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.test" }],
    })

    const { data } = await supabase
      .from("bookings")
      .select("id, booking_number, customer:customers(first_name, last_name, email)")
      .eq("id", "b1")
      .single()

    expect(data).toMatchObject({
      booking_number: "BT-2026-0001",
      customer: { first_name: "Ada", email: "ada@example.test" },
    })
  })

  it("mutates matching rows on update and reflects the patch in the store", async () => {
    const { supabase, store } = createSupabaseMock({
      quotes: [{ id: "q1", booking_id: "b1", status: "sent" }],
    })

    const { error } = await supabase.from("quotes").update({ status: "accepted" }).eq("id", "q1")

    expect(error).toBeNull()
    expect(store.rows("quotes")[0]).toMatchObject({ status: "accepted" })
  })

  it("returns a PGRST116 error from single() when no rows match", async () => {
    const { supabase } = createSupabaseMock({ bookings: [] })

    const { data, error } = await supabase.from("bookings").select("id").eq("id", "missing").single()

    expect(data).toBeNull()
    expect(error).toMatchObject({ code: "PGRST116" })
  })
})
