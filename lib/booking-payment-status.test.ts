import { describe, expect, it } from "vitest"
import { derivePaymentStatus, isPaymentStatus, PAYMENT_STATUS_LABELS } from "./booking-payment-status"

describe("derivePaymentStatus", () => {
  it("is Not paid for a sent quote with no money in", () => {
    expect(derivePaymentStatus({ stage: "quote_sent", depositPaid: false, totalPaid: 0 })).toBe("not_paid")
  })

  it("is Part paid when money is in but the deposit isn't covered", () => {
    expect(derivePaymentStatus({ stage: "deposit_requested", depositPaid: false, totalPaid: 500 })).toBe("part_paid")
  })

  it("trusts the deposit flag before the stage moves", () => {
    expect(derivePaymentStatus({ stage: "deposit_requested", depositPaid: true, totalPaid: 2500 })).toBe("deposit_paid")
    expect(derivePaymentStatus({ stage: "payment_schedule", depositPaid: true, totalPaid: 2500 })).toBe("deposit_paid")
  })

  it("is at least Deposit paid from Deposit Paid on", () => {
    expect(derivePaymentStatus({ stage: "deposit_paid", depositPaid: null, totalPaid: 0 })).toBe("deposit_paid")
  })

  it.each(["final_paid", "voucher_sent", "trip_active", "closed"])("is Paid in full at %s", (stage) => {
    expect(derivePaymentStatus({ stage, depositPaid: false, totalPaid: 0 })).toBe("paid_in_full")
  })

  it("flags a net refund or credit at any stage", () => {
    expect(derivePaymentStatus({ stage: "closed", depositPaid: true, totalPaid: -200 })).toBe("refund_or_credit")
    expect(derivePaymentStatus({ stage: "quote_sent", totalPaid: -1 })).toBe("refund_or_credit")
  })

  it("falls back to the money for an unknown stage", () => {
    expect(derivePaymentStatus({ stage: "mystery", totalPaid: 10 })).toBe("part_paid")
    expect(derivePaymentStatus({ stage: "lost", totalPaid: 0 })).toBe("not_paid")
  })

  it("has a label for every status", () => {
    expect(PAYMENT_STATUS_LABELS.paid_in_full).toBe("Paid in full")
    expect(isPaymentStatus("deposit_paid")).toBe(true)
    expect(isPaymentStatus("Full Paid")).toBe(false)
    expect(isPaymentStatus(undefined)).toBe(false)
  })
})
