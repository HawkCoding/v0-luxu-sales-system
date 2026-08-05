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

  it("returns no warnings when serviceBlocks is omitted", () => {
    const result = checkVoucherReadiness(readyInput)
    expect(result.warnings).toEqual([])
  })

  it("warns, but stays ready, when a train block has no contact name, address, times or guest counts", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "The Blue Train",
          serviceType: "train",
          supplierContactName: null,
          streetAddress: null,
          startTime: null,
          endTime: null,
          hasGuestBreakdown: false,
        },
      ],
    })
    expect(result.ready).toBe(true)
    expect(result.warnings.map((w) => w.code)).toEqual([
      "supplier_contact_missing",
      "supplier_address_missing",
      "service_times_missing",
      "guest_counts_missing",
    ])
    expect(result.warnings[0].message).toContain("The Blue Train")
  })

  it("does not warn about times/guests for a transfer block (neither concept applies)", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "Airport Transfer",
          serviceType: "transfer",
          supplierContactName: "Pierre",
          streetAddress: "5 Johannes Drive",
          startTime: null,
          endTime: null,
          hasGuestBreakdown: false,
        },
      ],
    })
    expect(result.warnings).toEqual([])
  })

  it("flags an airline block missing cabin, airport codes or baggage allowance", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "FlySafair FA-120",
          serviceType: "airline",
          supplierContactName: "Reservations",
          streetAddress: "Airport Rd",
          startTime: "16:20",
          endTime: "18:25",
          hasGuestBreakdown: false,
          cabin: null,
          departureAirportCode: "CPT",
          arrivalAirportCode: "JNB",
          handLuggageKg: 7,
          checkedLuggageKg: null,
        },
      ],
    })
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "flight_details_incomplete", message: expect.stringContaining("FlySafair FA-120") }),
    )
  })

  it("does not fail generation when warnings are present", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "The Blue Train",
          serviceType: "train",
          supplierContactName: null,
          streetAddress: null,
          startTime: null,
          endTime: null,
          hasGuestBreakdown: false,
        },
      ],
    })
    expect(result.ready).toBe(true)
    expect(result.failures).toHaveLength(0)
  })
})
