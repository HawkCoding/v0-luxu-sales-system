import { describe, it, expect } from "vitest"
import { checkItineraryReadiness } from "./check-readiness"

describe("checkItineraryReadiness", () => {
  const validInput = { stage: "deposit_paid", customerEmail: "guest@example.com" }

  it("is ready for deposit_paid", () => {
    expect(checkItineraryReadiness(validInput).ready).toBe(true)
  })

  it("is ready for final_paid, voucher_sent, closed", () => {
    for (const stage of ["final_paid", "voucher_sent", "closed"]) {
      expect(checkItineraryReadiness({ ...validInput, stage }).ready).toBe(true)
    }
  })

  it("not ready for stages before deposit_paid", () => {
    for (const stage of ["enquiry", "quoted", "quote_sent", "accepted", "deposit_requested"]) {
      const result = checkItineraryReadiness({ ...validInput, stage })
      expect(result.ready).toBe(false)
      expect(result.message).toContain("deposit paid")
    }
  })

  it("not ready when customer email is missing", () => {
    const result = checkItineraryReadiness({ stage: "deposit_paid", customerEmail: null })
    expect(result.ready).toBe(false)
    expect(result.message).toContain("email")
  })

  it("not ready when email is blank string", () => {
    const result = checkItineraryReadiness({ stage: "deposit_paid", customerEmail: "   " })
    expect(result.ready).toBe(false)
  })
})
