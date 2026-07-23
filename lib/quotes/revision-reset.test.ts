import { describe, expect, it } from "vitest"
import { planRevisionReset } from "./revision-reset"

const base = { depositPaid: false, totalPaid: 0, outcome: "Open" as string | null }

describe("planRevisionReset", () => {
  it("rewinds an unpaid booking all the way to enquiry", () => {
    const plan = planRevisionReset({ ...base, stage: "deposit_requested" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.changesStage).toBe(true)
    expect(plan.keepsDeposit).toBe(false)
    expect(plan.clearedFields).toEqual(
      expect.arrayContaining([
        "quote_sent_at",
        "accepted_at",
        "deposit_requested_at",
        "deposit_paid",
        "deposit_confirmed_manually",
        "invoice_balance",
      ]),
    )
  })

  it("clears only the stages actually crossed", () => {
    const plan = planRevisionReset({ ...base, stage: "quote_sent" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toContain("quote_sent_at")
    expect(plan.clearedFields).not.toContain("accepted_at")
  })

  it("floors the reset at deposit_requested once the deposit is paid", () => {
    const plan = planRevisionReset({
      ...base,
      stage: "voucher_sent",
      depositPaid: true,
      totalPaid: 25000,
    })

    expect(plan.targetStage).toBe("deposit_requested")
    expect(plan.keepsDeposit).toBe(true)
    expect(plan.clearedFields).toEqual(
      expect.arrayContaining(["deposit_paid_at", "final_paid_at", "voucher_sent_at"]),
    )
    expect(plan.clearedFields).not.toContain("deposit_paid")
    expect(plan.clearedFields).not.toContain("invoice_balance")
    expect(plan.summary.join(" ")).toContain("Payments already received are kept")
  })

  it("treats any recorded payment as a deposit floor even when the flag is false", () => {
    const plan = planRevisionReset({ ...base, stage: "deposit_paid", totalPaid: 100 })

    expect(plan.targetStage).toBe("deposit_requested")
    expect(plan.keepsDeposit).toBe(true)
  })

  it("clears an auto-set Won outcome", () => {
    const plan = planRevisionReset({ ...base, stage: "voucher_sent", outcome: "Won" })

    expect(plan.clearedFields).toEqual(expect.arrayContaining(["outcome", "outcome_set_at"]))
  })

  it("is a no-op for a booking already at the floor", () => {
    const plan = planRevisionReset({ ...base, stage: "enquiry" })

    expect(plan.changesStage).toBe(false)
    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toEqual([])
    expect(plan.summary[0]).toContain("stays at Enquiry")
  })

  it("leaves off-ladder stages alone", () => {
    const plan = planRevisionReset({ ...base, stage: "lost" })

    expect(plan.changesStage).toBe(false)
    expect(plan.targetStage).toBe("lost")
  })

  it("canonicalises legacy stage aliases", () => {
    const plan = planRevisionReset({ ...base, stage: "payment_schedule" })

    expect(plan.targetStage).toBe("enquiry")
    expect(plan.clearedFields).toContain("deposit_requested_at")
  })

  it("always voids unpaid invoices and supersedes the parent quote", () => {
    const plan = planRevisionReset({ ...base, stage: "accepted" })

    expect(plan.voidsInvoices).toBe(true)
    expect(plan.summary.join(" ")).toContain("Superseded")
  })
})
