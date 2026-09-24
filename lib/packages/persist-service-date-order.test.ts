import { describe, expect, it, vi } from "vitest"
import { persistServiceDateOrder } from "@/lib/packages/persist-service-date-order"

interface ServiceRow {
  id: string
  sort_order: number
  service_date: string | null
  departure_time: string | null
  suppliers: { kind: string } | null
}

function createSupabase(services: ServiceRow[], rpcError: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: null, error: rpcError }))
  const update = vi.fn()
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(async () =>
        table === "booking_services" ? { data: services, error: null } : { data: [], error: null },
      ),
    })),
    update,
  }))
  return { supabase: { from, rpc } as never, rpc, update }
}

const hotel = (id: string, sortOrder: number, date: string): ServiceRow => ({
  id,
  sort_order: sortOrder,
  service_date: date,
  departure_time: null,
  suppliers: { kind: "hotel_property" },
})

describe("persistServiceDateOrder", () => {
  it("writes nothing when the legs are already in date order", async () => {
    const { supabase, rpc } = createSupabase([hotel("a", 0, "2026-11-01"), hotel("b", 1, "2026-11-02")])

    const result = await persistServiceDateOrder(supabase, "booking-1")

    expect(result).toEqual({ error: null, changedServiceIds: [] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("sends only the moved rows, in one RPC call, never per-row updates", async () => {
    const { supabase, rpc, update } = createSupabase([
      hotel("late", 0, "2026-11-05"),
      hotel("early", 1, "2026-11-01"),
      hotel("undated", 2, "2026-11-09"),
    ])

    const result = await persistServiceDateOrder(supabase, "booking-1")

    expect(update).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("set_booking_service_sort_orders", {
      p_booking_id: "booking-1",
      p_orders: [
        { id: "early", sort_order: 0 },
        { id: "late", sort_order: 1 },
      ],
    })
    expect(result).toEqual({ error: null, changedServiceIds: ["early", "late"] })
  })

  it("reports an RPC failure and claims no rows changed", async () => {
    const { supabase } = createSupabase(
      [hotel("late", 0, "2026-11-05"), hotel("early", 1, "2026-11-01")],
      { message: "permission denied" },
    )

    const result = await persistServiceDateOrder(supabase, "booking-1")

    expect(result).toEqual({ error: "permission denied", changedServiceIds: [] })
  })
})
