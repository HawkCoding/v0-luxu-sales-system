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

  it("returns quoted_leg_missing when the accepted quote prices a leg the builder no longer has", () => {
    const result = checkVoucherReadiness({ ...readyInput, missingQuotedLegLabels: ["Rovos Rail"] })
    expect(result.ready).toBe(false)
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "quoted_leg_missing", message: expect.stringContaining("Rovos Rail") }),
    )
  })

  it("stays ready when no quoted legs are missing", () => {
    expect(checkVoucherReadiness({ ...readyInput, missingQuotedLegLabels: [] }).ready).toBe(true)
    expect(checkVoucherReadiness({ ...readyInput }).ready).toBe(true)
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

  it("does not warn about a train block's address once it has a boarding point, even with no street address", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "Rovos Rail",
          serviceType: "train",
          supplierContactName: "Carla",
          streetAddress: null,
          boardingPoint: "Rovos Rail Station, Capital Park, Pretoria",
          startTime: "09:00",
          endTime: "16:00",
          hasGuestBreakdown: true,
        },
      ],
    })
    expect(result.warnings).toEqual([])
  })

  it("warns about a train block with a street address but no boarding point", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "Rovos Rail",
          serviceType: "train",
          supplierContactName: "Carla",
          streetAddress: "1 Head Office Road",
          boardingPoint: null,
          startTime: "09:00",
          endTime: "16:00",
          hasGuestBreakdown: true,
        },
      ],
    })
    expect(result.warnings.map((w) => w.code)).toEqual(["supplier_address_missing"])
    expect(result.warnings[0].message).toContain("Rovos Rail")
  })

  it("still judges a hotel block on its street address, ignoring any boarding point", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "The Silo Hotel",
          serviceType: "hotel",
          supplierContactName: "Reservations",
          streetAddress: null,
          boardingPoint: "Cape Town Station",
          location: "Cape Town",
          startTime: "14:00",
          endTime: "11:00",
          hasGuestBreakdown: true,
        },
      ],
    })
    expect(result.warnings.map((w) => w.code)).toEqual(["supplier_address_missing"])
  })

  it("warns when a hotel block has no city set", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "The Silo Hotel",
          serviceType: "hotel",
          supplierContactName: "Reservations",
          streetAddress: "Silo Square, V&A Waterfront",
          location: null,
          startTime: "14:00",
          endTime: "11:00",
          hasGuestBreakdown: true,
        },
      ],
    })
    expect(result.warnings.map((w) => w.code)).toEqual(["supplier_location_missing"])
    expect(result.warnings[0].message).toContain("The Silo Hotel")
  })

  it("does not warn about a train block's city -- it carries free text there instead", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "Rovos Rail",
          serviceType: "train",
          supplierContactName: "Carla",
          boardingPoint: "Rovos Rail Station, Capital Park, Pretoria",
          location: null,
          startTime: "09:00",
          endTime: "16:00",
          hasGuestBreakdown: true,
        },
      ],
    })
    expect(result.warnings).toEqual([])
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
          location: "Cape Town",
          startTime: null,
          endTime: null,
          hasGuestBreakdown: false,
        },
      ],
    })
    expect(result.warnings).toEqual([])
  })

  it.each(["transfer", "airline"] as const)(
    "does not warn about a missing street address or city for a %s block — the voucher never prints one",
    (serviceType) => {
      const result = checkVoucherReadiness({
        ...readyInput,
        serviceBlocks: [
          {
            title: "Airport Transfer",
            serviceType,
            supplierContactName: "Pierre",
            streetAddress: null,
            location: null,
            startTime: "09:00",
            endTime: "10:00",
            arrivalDate: "2026-06-01",
            hasGuestBreakdown: true,
            cabin: "Economy",
            departureAirportCode: "CPT",
            arrivalAirportCode: "JNB",
            handLuggageKg: 7,
            checkedLuggageKg: 23,
          },
        ],
      })
      expect(result.warnings.map((w) => w.code)).not.toContain("supplier_address_missing")
      expect(result.warnings.map((w) => w.code)).not.toContain("supplier_location_missing")
    },
  )

  it("warns about a missing street address and city for a tour block — its only printed location", () => {
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "Cape Peninsula Full Day",
          serviceType: "tour",
          supplierContactName: "Reservations",
          streetAddress: null,
          location: null,
          hasGuestBreakdown: false,
        },
      ],
    })
    expect(result.warnings.map((w) => w.code)).toEqual(["supplier_address_missing", "supplier_location_missing"])
    expect(result.warnings.every((w) => w.message.includes("Cape Peninsula Full Day"))).toBe(true)
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

  it("flags an airline block missing a departure time, arrival time or arrival date", () => {
    const completeFlight = {
      title: "SAfair FA212",
      serviceType: "airline",
      supplierContactName: "Reservations",
      streetAddress: "Airport Rd",
      location: "Cape Town",
      startTime: "10:00",
      endTime: "12:15",
      arrivalDate: "2026-10-14",
      hasGuestBreakdown: false,
      cabin: "Economy",
      departureAirportCode: "HLA",
      arrivalAirportCode: "CPT",
      handLuggageKg: 7,
      checkedLuggageKg: 23,
    }

    expect(checkVoucherReadiness({ ...readyInput, serviceBlocks: [completeFlight] }).warnings).toEqual([])

    for (const missing of [{ startTime: null }, { endTime: null }, { arrivalDate: null }]) {
      const result = checkVoucherReadiness({
        ...readyInput,
        serviceBlocks: [{ ...completeFlight, ...missing }],
      })
      expect(result.warnings.map((w) => w.code)).toEqual(["flight_times_incomplete"])
      expect(result.warnings[0].message).toContain("SAfair FA212")
    }
  })

  it("no longer judges a flight by the generic service_times_missing rule", () => {
    // That warning's fix hint points at the supplier's default times, which are meaningless for an
    // airline — every booking is a different flight.
    const result = checkVoucherReadiness({
      ...readyInput,
      serviceBlocks: [
        {
          title: "SAfair FA212",
          serviceType: "airline",
          supplierContactName: "Reservations",
          streetAddress: "Airport Rd",
          location: "Cape Town",
          startTime: null,
          endTime: null,
          arrivalDate: null,
          hasGuestBreakdown: false,
          cabin: "Economy",
          departureAirportCode: "HLA",
          arrivalAirportCode: "CPT",
          handLuggageKg: 7,
          checkedLuggageKg: 23,
        },
      ],
    })
    expect(result.warnings.map((w) => w.code)).toEqual(["flight_times_incomplete"])
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
