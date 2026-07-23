import { describe, expect, it } from "vitest"
import { buildUnifiedTotals } from "./build-unified-totals"
import type { InvoiceBalance } from "./calculate-balance"

function makeBalance(overrides: Partial<InvoiceBalance> = {}): InvoiceBalance {
  return {
    quote: { id: "q1", subtotal: 10000, total: 10000, status: "accepted", created_at: "2026-07-01T00:00:00Z" },
    quoteTotal: 10000,
    quoteSubtotal: 10000,
    totalPaid: 0,
    lastPaymentAt: null,
    balance: 10000,
    ...overrides,
  }
}

describe("buildUnifiedTotals", () => {
  it("builds the deposit-split ladder by default", () => {
    const totals = buildUnifiedTotals({
      balance: makeBalance(),
      departureDate: "2026-12-01",
      depositPercentage: 25,
      depositAmount: 2500,
    })
    expect(totals.depositAmount).toBe(2500)
    expect(totals.depositPercentage).toBe(25)
    expect(totals.finalAmount).toBe(7500)
    expect(totals.fullPayment).toBeUndefined()
  })

  it("suppresses the deposit row and shows the full total in full mode", () => {
    const totals = buildUnifiedTotals({
      balance: makeBalance({ quoteTotal: 10000, balance: 10000 }),
      departureDate: "2026-08-01",
      depositPercentage: null,
      depositAmount: null,
      mode: "full",
    })
    expect(totals.depositAmount).toBeNull()
    expect(totals.depositPercentage).toBeNull()
    expect(totals.finalAmount).toBe(10000)
    expect(totals.fullPayment).toBe(true)
  })

  it("uses the given fullDueDate override instead of the 60-day rule", () => {
    const totals = buildUnifiedTotals({
      balance: makeBalance(),
      departureDate: "2026-08-01",
      depositPercentage: null,
      depositAmount: null,
      mode: "full",
      fullDueDate: "2026-07-25",
    })
    expect(totals.finalDueDate).toBe("2026-07-25")
  })

  it("reflects payments received in full mode outstanding", () => {
    const totals = buildUnifiedTotals({
      balance: makeBalance({ totalPaid: 10000, balance: 0, lastPaymentAt: "2026-07-20" }),
      departureDate: null,
      depositPercentage: null,
      depositAmount: null,
      mode: "full",
    })
    expect(totals.outstanding).toBe(0)
    expect(totals.amountReceived).toBe(10000)
  })
})
