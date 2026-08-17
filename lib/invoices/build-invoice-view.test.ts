import { describe, expect, it } from "vitest"
import { buildBillingParty, buildDaysLabel, resolveDurationNights } from "@/lib/invoices/build-invoice-view"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"

function trainBlock(durationDays: number | null, displayOrder = 0): VoucherServiceBlock {
  return {
    serviceType: "train",
    title: "Rovos Rail",
    contactDetails: {},
    displayOrder,
    serviceData: { durationDays },
  }
}

describe("resolveDurationNights", () => {
  it("prefers the trip start/end date range", () => {
    const nights = resolveDurationNights(
      { trip_start_date: "2026-12-27", trip_end_date: "2026-12-29", duration_nights: null },
      [trainBlock(1)],
    )
    expect(nights).toBe(2)
  })

  it("falls back to the outbound train route's duration_days when the trip range is unset", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: null },
      [trainBlock(3)],
    )
    expect(nights).toBe(2)
  })

  it("falls back to the legacy duration_nights column when nothing else is available", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: 4 },
      [],
    )
    expect(nights).toBe(4)
  })

  it("returns null when no source has a usable value", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: null },
      [trainBlock(null)],
    )
    expect(nights).toBeNull()
  })

  it("ignores an inverted or same-day trip range and falls through to the next source", () => {
    const nights = resolveDurationNights(
      { trip_start_date: "2026-12-29", trip_end_date: "2026-12-29", duration_nights: null },
      [trainBlock(3)],
    )
    expect(nights).toBe(2)
  })

  it("uses the earliest-ordered train block when there are multiple legs", () => {
    const nights = resolveDurationNights(
      { trip_start_date: null, trip_end_date: null, duration_nights: null },
      [trainBlock(5, 1), trainBlock(2, 0)],
    )
    expect(nights).toBe(1)
  })
})

describe("buildBillingParty", () => {
  it("reads company, VAT and address from booking_reservation_details, not the customer profile", () => {
    const billing = buildBillingParty(
      {
        billing_company_name: "Acme Travel",
        billing_vat_number: "VAT123",
        billing_address_line1: "1 Job St",
        billing_address_line2: null,
        billing_city: "Cape Town",
        billing_province: "Western Cape",
        billing_postal_code: "8001",
        billing_country: "South Africa",
      },
      { phone: "+27 21 555 0000", email: "customer@example.com" },
    )
    expect(billing.companyName).toBe("Acme Travel")
    expect(billing.vatNumber).toBe("VAT123")
    expect(billing.postalCode).toBe("8001")
    expect(billing.addressLines).toEqual(["1 Job St", "Cape Town, Western Cape", "South Africa"])
    // Phone and e-mail are the one exception — still sourced from the customer profile.
    expect(billing.phone).toBe("+27 21 555 0000")
    expect(billing.email).toBe("customer@example.com")
  })

  it("has no fallback to the customer profile — a null details row prints blank, not customer data", () => {
    const billing = buildBillingParty(null, { phone: "+27 21 555 0000", email: "customer@example.com" })
    expect(billing.companyName).toBeNull()
    expect(billing.vatNumber).toBeNull()
    expect(billing.postalCode).toBeNull()
    expect(billing.addressLines).toEqual([])
    expect(billing.phone).toBe("+27 21 555 0000")
    expect(billing.email).toBe("customer@example.com")
  })

  it("drops empty address lines rather than printing blanks", () => {
    const billing = buildBillingParty(
      {
        billing_company_name: null,
        billing_vat_number: null,
        billing_address_line1: "1 Job St",
        billing_address_line2: null,
        billing_city: null,
        billing_province: null,
        billing_postal_code: null,
        billing_country: null,
      },
      null,
    )
    expect(billing.addressLines).toEqual(["1 Job St"])
  })
})

describe("buildDaysLabel", () => {
  it("formats a plural nights/days label", () => {
    expect(buildDaysLabel(2)).toBe("2 Nights / 3 Days")
  })

  it("formats the singular night correctly", () => {
    expect(buildDaysLabel(1)).toBe("1 Night / 2 Days")
  })

  it("returns null for a missing or non-positive duration", () => {
    expect(buildDaysLabel(null)).toBeNull()
    expect(buildDaysLabel(0)).toBeNull()
  })
})
