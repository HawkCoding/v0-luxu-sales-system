import { describe, expect, it } from "vitest"
import { checkVoucherReadiness, type VoucherReadinessInput } from "../check-readiness"

const readyInput: VoucherReadinessInput = {
  stage: "final_paid",
  invoiceBalance: 0,
  departureDate: "2026-06-01",
  customerEmail: "ada@example.test",
  missingLegReferenceLabels: [],
}

describe("checkVoucherReadiness", () => {
  it("returns ready when all conditions are met", () => {
    const result = checkVoucherReadiness(readyInput)
    expect(result.ready).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  it("accepts voucher_sent stage as eligible", () => {
    const result = checkVoucherReadiness({ ...readyInput, stage: "voucher_sent" })
    expect(result.ready).toBe(true)
  })

  it("accepts closed stage as eligible", () => {
    const result = checkVoucherReadiness({ ...readyInput, stage: "closed" })
    expect(result.ready).toBe(true)
  })

  it("returns stage_not_eligible when stage is deposit_paid", () => {
    const result = checkVoucherReadiness({ ...readyInput, stage: "deposit_paid" })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "stage_not_eligible" }))
  })

  it("returns stage_not_eligible when stage is null", () => {
    const result = checkVoucherReadiness({ ...readyInput, stage: null })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "stage_not_eligible" }))
  })

  it("returns balance_not_zero when invoiceBalance is 100", () => {
    const result = checkVoucherReadiness({ ...readyInput, invoiceBalance: 100 })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "balance_not_zero" }))
  })

  it("returns balance_not_zero when invoiceBalance is null", () => {
    const result = checkVoucherReadiness({ ...readyInput, invoiceBalance: null })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "balance_not_zero" }))
  })

  it("returns departure_date_missing when departureDate is null", () => {
    const result = checkVoucherReadiness({ ...readyInput, departureDate: null })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "departure_date_missing" }))
  })

  it("returns customer_email_missing when customerEmail is null", () => {
    const result = checkVoucherReadiness({ ...readyInput, customerEmail: null })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "customer_email_missing" }))
  })

  it("returns customer_email_missing when customerEmail is empty string", () => {
    const result = checkVoucherReadiness({ ...readyInput, customerEmail: "" })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "customer_email_missing" }))
  })

  it("returns customer_email_missing when customerEmail is whitespace only", () => {
    const result = checkVoucherReadiness({ ...readyInput, customerEmail: "   " })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "customer_email_missing" }))
  })

  it("returns leg_references_missing when a leg has no supplier reference", () => {
    const result = checkVoucherReadiness({ ...readyInput, missingLegReferenceLabels: ["Hotel: Cape Town"] })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "leg_references_missing", message: expect.stringContaining("Hotel: Cape Town") }),
    )
  })

  it("accumulates all five failures simultaneously", () => {
    const result = checkVoucherReadiness({
      stage: "deposit_paid",
      invoiceBalance: 500,
      departureDate: null,
      customerEmail: null,
      missingLegReferenceLabels: ["Hotel: Cape Town"],
    })
    expect(result.ready).toBe(false)
    expect(result.failures.map((f) => f.code)).toEqual([
      "stage_not_eligible",
      "balance_not_zero",
      "departure_date_missing",
      "customer_email_missing",
      "leg_references_missing",
    ])
  })

  it("includes message and fixHint on each failure", () => {
    const result = checkVoucherReadiness({ ...readyInput, stage: "enquiry" })
    expect(result.failures[0]).toMatchObject({
      code: "stage_not_eligible",
      message: expect.stringContaining("Paid in Full"),
      fixHint: expect.stringContaining("Move"),
    })
  })
})
