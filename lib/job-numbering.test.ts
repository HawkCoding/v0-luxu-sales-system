import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import {
  addJobNumberingMetadata,
  allocateJobNumber,
  allocateJobNumberForBooking,
  formatBookingNumber,
  resolveJobNumberPrefixFromSources,
} from "@/lib/job-numbering"
import type { Database } from "@/lib/supabase/types"

type MockSupabase = SupabaseClient<Database>

function createNumberingSupabase(): MockSupabase {
  const state = new Map<string, number>()
  return {
    rpc: vi.fn(async (functionName: string, args: { p_product_code: string; p_year: number }) => {
      if (functionName !== "next_booking_number") {
        return { data: null, error: { message: `Unexpected RPC: ${functionName}` } }
      }

      const key = `${args.p_product_code}-${args.p_year}`
      const next = (state.get(key) ?? 0) + 1
      state.set(key, next)

      return { data: next, error: null }
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
        in: vi.fn(async () => ({ data: [], error: null })),
      })),
    })),
  } as unknown as MockSupabase
}

describe("resolveJobNumberPrefixFromSources", () => {
  it("maps Blue Train sources to BT", () => {
    expect(resolveJobNumberPrefixFromSources({ supplierName: "Blue Train" })).toMatchObject({
      prefix: "BT",
      needsReview: false,
      reason: "matched_blue_train",
    })
  })

  it("maps Rovos Rail sources to RR", () => {
    expect(resolveJobNumberPrefixFromSources({ rawText: "Please quote Rovos Rail" })).toMatchObject({
      prefix: "RR",
      needsReview: false,
      reason: "matched_rovos_rail",
    })
  })

  it("uses review fallback for unknown products", () => {
    expect(resolveJobNumberPrefixFromSources({ rawText: "Luxury train enquiry" })).toMatchObject({
      prefix: "REV",
      needsReview: true,
      reason: "unknown_train_product",
    })
  })

  it("uses review fallback when both train products are present", () => {
    expect(resolveJobNumberPrefixFromSources({ rawText: "Compare Blue Train and Rovos Rail" })).toMatchObject({
      prefix: "REV",
      needsReview: true,
      reason: "ambiguous_train_product",
    })
  })
})

describe("allocateJobNumber", () => {
  it("formats generated non-review booking numbers", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "BT", new Date("2026-05-16T00:00:00Z")))
      .resolves.toMatch(/^(BT|RR)-\d{4}-\d{4}$/)
  })

  it("increments Blue Train independently from Rovos Rail", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "BT", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("BT-2026-0001")
    await expect(allocateJobNumber(supabase, "RR", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("RR-2026-0001")
    await expect(allocateJobNumber(supabase, "BT", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("BT-2026-0002")
  })

  it("increments Rovos Rail independently from Blue Train", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "RR", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("RR-2026-0001")
    await expect(allocateJobNumber(supabase, "BT", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("BT-2026-0001")
    await expect(allocateJobNumber(supabase, "RR", new Date("2026-01-01T00:00:00Z")))
      .resolves.toBe("RR-2026-0002")
  })

  it("resets counters when the year changes", async () => {
    const supabase = createNumberingSupabase()

    await expect(allocateJobNumber(supabase, "BT", new Date("2026-12-31T00:00:00Z")))
      .resolves.toBe("BT-2026-0001")
    await expect(allocateJobNumber(supabase, "BT", new Date("2027-01-01T00:00:00Z")))
      .resolves.toBe("BT-2027-0001")
  })

  it("returns distinct numbers for concurrent allocations", async () => {
    const supabase = createNumberingSupabase()

    const results = await Promise.all([
      allocateJobNumber(supabase, "RR", new Date("2026-01-01T00:00:00Z")),
      allocateJobNumber(supabase, "RR", new Date("2026-01-01T00:00:00Z")),
    ])

    expect(new Set(results).size).toBe(2)
    expect(results.sort()).toEqual(["RR-2026-0001", "RR-2026-0002"])
  })
})

describe("allocateJobNumberForBooking", () => {
  it("allocates review fallback safely for unknown products", async () => {
    const supabase = createNumberingSupabase()

    const allocation = await allocateJobNumberForBooking(
      supabase,
      { rawText: "Luxury rail enquiry" },
      new Date("2026-01-01T00:00:00Z"),
    )

    expect(allocation.bookingNumber).toBe("REV-2026-0001")
    expect(allocation.resolution).toMatchObject({
      prefix: "REV",
      needsReview: true,
      reason: "unknown_train_product",
    })
    expect(addJobNumberingMetadata({}, allocation.resolution)).toMatchObject({
      numbering: {
        productPrefix: "REV",
        needsReview: true,
        reason: "unknown_train_product",
      },
    })
  })
})

describe("formatBookingNumber", () => {
  it("zero-pads sequence numbers to four digits", () => {
    expect(formatBookingNumber("BT", 2026, 7)).toBe("BT-2026-0007")
  })
})
