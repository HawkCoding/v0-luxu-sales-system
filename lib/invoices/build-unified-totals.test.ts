import { describe, expect, it } from "vitest"
import { buildUnifiedTotals } from "./build-unified-totals"
import type { InvoiceBalance } from "./calculate-balance"

function makeBalance(overrides: Partial<InvoiceBalance> = {}): InvoiceBalance {
  return {
    quote: {
      id: "q1",
      subtotal: 10000,
      total: 10000,
      agent_commission: 0,
      discount_amount: 0,
      discount_visible: true,
      currency: "ZAR",
      status: "accepted",
      created_at: "2026-07-01T00:00:00Z",
    },
    quoteTotal: 10000,
    quoteSubtotal: 10000,
    agentCommission: 0,
    discount: 0,
    discountVisible: true,
    currency: "ZAR",
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

  describe("recorded payments", () => {
    const quoteTotal = 344180
    const base = {
      quoteTotal,
      quoteSubtotal: quoteTotal,
      quote: { ...makeBalance().quote, total: quoteTotal, subtotal: quoteTotal },
    }

    it("shows the recorded deposit and final payment instead of the calculated 25/75 split", () => {
      const totals = buildUnifiedTotals({
        balance: makeBalance({
          ...base,
          totalPaid: quoteTotal,
          balance: 0,
          payments: [
            { amount: 85157.5, receivedAt: "2026-07-01" },
            { amount: 259022.5, receivedAt: "2026-11-05" },
          ],
        }),
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 86045,
      })
      expect(totals.depositAmount).toBe(85157.5)
      expect(totals.depositPercentage).toBeNull()
      expect(totals.finalAmount).toBe(259022.5)
      expect(totals.outstanding).toBe(0)
    })

    it("shows the amount still due as final while only the deposit is recorded", () => {
      const totals = buildUnifiedTotals({
        balance: makeBalance({
          ...base,
          totalPaid: 85157.5,
          balance: 259022.5,
          payments: [{ amount: 85157.5, receivedAt: "2026-07-01" }],
        }),
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 86045,
      })
      expect(totals.depositAmount).toBe(85157.5)
      expect(totals.finalAmount).toBe(259022.5)
    })

    it("keeps the calculated ladder when nothing is recorded", () => {
      const totals = buildUnifiedTotals({
        balance: makeBalance({ ...base, payments: [] }),
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 86045,
      })
      expect(totals.depositAmount).toBe(86045)
      expect(totals.depositPercentage).toBe(25)
      expect(totals.finalAmount).toBe(258135)
    })

    it("keeps the calculated ladder while a token payment has not covered the deposit", () => {
      const totals = buildUnifiedTotals({
        balance: makeBalance({
          ...base,
          totalPaid: 1000,
          balance: 343180,
          payments: [{ amount: 1000, receivedAt: "2026-07-01" }],
        }),
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 86045,
      })
      expect(totals.depositAmount).toBe(86045)
      expect(totals.depositPercentage).toBe(25)
    })
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

  it("uses the given fullDueDate override instead of the 2-month rule", () => {
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

  describe("agent commission", () => {
    // quoteSubtotal is the gross travel price, quoteTotal is already net of the discount — the
    // deposit is a percentage of the net (calculateDepositAmount is fed quote.total elsewhere),
    // so this ladder just has to carry both figures through without recomputing either.
    const balance = makeBalance({ quoteSubtotal: 12000, quoteTotal: 10000, agentCommission: 2000, balance: 10000 })

    it("carries the gross subtotal, the commission and the net total separately", () => {
      const totals = buildUnifiedTotals({
        balance,
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 2500,
      })
      expect(totals.subtotalInclVat).toBe(12000)
      expect(totals.agentCommission).toBe(2000)
      expect(totals.totalInclVat).toBe(10000)
      expect(totals.finalAmount).toBe(7500)
    })

    it("carries the same split through full-payment mode", () => {
      const totals = buildUnifiedTotals({
        balance,
        departureDate: "2026-08-01",
        depositPercentage: null,
        depositAmount: null,
        mode: "full",
      })
      expect(totals.subtotalInclVat).toBe(12000)
      expect(totals.agentCommission).toBe(2000)
      expect(totals.totalInclVat).toBe(10000)
      expect(totals.finalAmount).toBe(10000)
    })

    it("leaves subtotalInclVat === totalInclVat when there is no commission", () => {
      const totals = buildUnifiedTotals({
        balance: makeBalance(),
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 2500,
      })
      expect(totals.subtotalInclVat).toBe(totals.totalInclVat)
      expect(totals.agentCommission).toBe(0)
    })
  })

  describe("discount", () => {
    it("carries the discount and its visibility through", () => {
      const totals = buildUnifiedTotals({
        balance: makeBalance({ quoteSubtotal: 12000, quoteTotal: 10000, discount: 2000, discountVisible: false }),
        departureDate: "2026-12-01",
        depositPercentage: 25,
        depositAmount: 2500,
      })
      expect(totals.discount).toBe(2000)
      expect(totals.discountVisible).toBe(false)
    })
  })
})
