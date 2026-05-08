import { describe, expect, it, vi } from "vitest"
import { calculateInvoiceBalance } from "./calculate-balance"

function createSupabaseMock(quote: unknown, payments: unknown[]) {
  const statusEq = vi.fn(() => ({
    order: () => ({
      limit: () => ({
        maybeSingle: async () => ({ data: quote, error: null }),
      }),
    }),
  }))

  return {
    statusEq,
    from(table: string) {
      if (table === "quotes") {
        return {
          select: () => ({
            eq: vi.fn((_column: string, _value: string) => ({ eq: statusEq })),
          }),
        }
      }

      if (table === "payments") {
        return {
          select: () => ({
            eq: async () => ({ data: payments, error: null }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe("calculateInvoiceBalance", () => {
  it("returns the full quote total when no payments exist", async () => {
    const supabase = createSupabaseMock(
      { id: "quote-1", total: 1200, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" },
      [],
    )
    const result = await calculateInvoiceBalance(
      supabase as never,
      "booking-1",
    )

    expect(result.balance).toBe(1200)
    expect(result.totalPaid).toBe(0)
    expect(supabase.statusEq).toHaveBeenCalledWith("status", "accepted")
  })

  it("subtracts recorded payments from the quote total", async () => {
    const result = await calculateInvoiceBalance(
      createSupabaseMock(
        { id: "quote-1", total: 1200, status: "accepted", created_at: "2026-05-01T00:00:00.000Z" },
        [{ amount: 300 }, { amount: 150 }],
      ) as never,
      "booking-1",
    )

    expect(result.balance).toBe(750)
    expect(result.totalPaid).toBe(450)
  })
})
