import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import {
  allocateJobNumber,
  allocateJobNumberBlock,
  allocateJobNumberForBooking,
  formatBookingNumber,
} from "@/lib/job-numbering"
import type { Database } from "@/lib/supabase/types"

type MockSupabase = SupabaseClient<Database>

function createNumberingSupabase(): MockSupabase {
  const state = new Map<string, number>()
  return {
    rpc: vi.fn(
      async (functionName: string, args: { p_product_code: string; p_year: number; p_count?: number }) => {
        if (functionName !== "next_booking_number" && functionName !== "next_booking_number_block") {
          return { data: null, error: { message: `Unexpected RPC: ${functionName}` } }
        }

        const key = `${args.p_product_code}-${args.p_year}`
        const step = functionName === "next_booking_number_block" ? (args.p_count ?? 0) : 1
        const last = (state.get(key) ?? 0) + step
        state.set(key, last)

        return { data: last, error: null }
      },
    ),
  } as unknown as MockSupabase
}

describe("allocateJobNumber", () => {
  it("formats generated booking numbers", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "LTT", new Date("2026-05-16T00:00:00Z")))
      .resolves.toMatch(/^LTT-\d{4}-\d{4}$/)
  })

  it("increments within a year", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "LTT", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("LTT-2026-0001")
    await expect(allocateJobNumber(supabase, "LTT", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("LTT-2026-0002")
  })

  it("resets counters when the year changes", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "LTT", new Date("2026-12-31T00:00:00Z")))
      .resolves.toBe("LTT-2026-0001")
    await expect(allocateJobNumber(supabase, "LTT", new Date("2027-01-01T00:00:00Z")))
      .resolves.toBe("LTT-2027-0001")
  })

  it("returns distinct numbers for concurrent allocations", async () => {
    const supabase = createNumberingSupabase()

    const results = await Promise.all([
      allocateJobNumber(supabase, "LTT", new Date("2026-01-01T00:00:00Z")),
      allocateJobNumber(supabase, "LTT", new Date("2026-01-01T00:00:00Z")),
    ])

    expect(new Set(results).size).toBe(2)
    expect(results.sort()).toEqual(["LTT-2026-0001", "LTT-2026-0002"])
  })

  it("surfaces allocation failures", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "sequence unavailable" } })),
    } as unknown as MockSupabase

    await expect(allocateJobNumber(supabase, "LTT", new Date("2026-01-01T00:00:00Z")))
      .rejects.toThrow("sequence unavailable")
  })
})

describe("allocateJobNumberBlock", () => {
  it("returns a contiguous block in one round trip", async () => {
    const supabase = createNumberingSupabase()

    const numbers = await allocateJobNumberBlock(supabase, 3, "LTT", new Date("2026-01-01T00:00:00Z"))

    expect(numbers).toEqual(["LTT-2026-0001", "LTT-2026-0002", "LTT-2026-0003"])
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it("does not overlap with numbers already allocated", async () => {
    const supabase = createNumberingSupabase()
    const createdAt = new Date("2026-01-01T00:00:00Z")

    await allocateJobNumber(supabase, "LTT", createdAt)
    const numbers = await allocateJobNumberBlock(supabase, 2, "LTT", createdAt)
    const afterBlock = await allocateJobNumber(supabase, "LTT", createdAt)

    expect(numbers).toEqual(["LTT-2026-0002", "LTT-2026-0003"])
    expect(afterBlock).toBe("LTT-2026-0004")
  })

  it("rejects a non-positive block size before hitting the database", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumberBlock(supabase, 0)).rejects.toThrow("Invalid booking number block size")
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it("surfaces allocation failures", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "sequence unavailable" } })),
    } as unknown as MockSupabase

    await expect(allocateJobNumberBlock(supabase, 5)).rejects.toThrow("sequence unavailable")
  })
})

describe("allocateJobNumberForBooking", () => {
  it("allocates an LTT number regardless of the booked product", async () => {
    const supabase = createNumberingSupabase()

    const allocation = await allocateJobNumberForBooking(supabase, new Date("2026-01-01T00:00:00Z"))

    expect(allocation.bookingNumber).toBe("LTT-2026-0001")
  })

  it("does not read routes, packages or suppliers to pick a prefix", async () => {
    const supabase = createNumberingSupabase()
    const from = vi.fn()
    ;(supabase as unknown as { from: unknown }).from = from

    await allocateJobNumberForBooking(supabase, new Date("2026-01-01T00:00:00Z"))

    expect(from).not.toHaveBeenCalled()
  })
})

describe("formatBookingNumber", () => {
  it("zero-pads sequence numbers to four digits", () => {
    expect(formatBookingNumber("LTT", 2026, 7)).toBe("LTT-2026-0007")
  })
})
