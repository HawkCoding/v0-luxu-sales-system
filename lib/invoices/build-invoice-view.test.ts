import { describe, expect, it } from "vitest"
import {
  buildBillingParty,
  buildDaysLabel,
  buildDeparture,
  resolveDurationNights,
  selectPrimaryBlocks,
} from "@/lib/invoices/build-invoice-view"
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

  it("prefers the primary block's own span over the whole trip's range (F-P3-4)", () => {
    // A pre-arrival transfer three days before a tour widens trip_start/trip_end to 5 nights, but
    // the tour itself only spans 3 -- the invoice's "Days" figure must describe the tour, not the
    // trip an add-on stretched.
    const tourBlock: VoucherServiceBlock = {
      serviceType: "tour",
      title: "Sabi Wilderness Journeys",
      contactDetails: {},
      displayOrder: 0,
      serviceData: { departureDate: "2026-11-20", arrivalDate: "2026-11-23" },
    }
    const nights = resolveDurationNights(
      { trip_start_date: "2026-11-17", trip_end_date: "2026-11-22", duration_nights: null },
      [tourBlock],
      tourBlock,
    )
    expect(nights).toBe(3)
  })

  it("falls through to the trip range when the primary block has no usable span", () => {
    const tourBlock: VoucherServiceBlock = {
      serviceType: "tour",
      title: "Sabi Wilderness Journeys",
      contactDetails: {},
      displayOrder: 0,
      serviceData: { departureDate: "2026-11-20", arrivalDate: null },
    }
    const nights = resolveDurationNights(
      { trip_start_date: "2026-11-17", trip_end_date: "2026-11-22", duration_nights: null },
      [tourBlock],
      tourBlock,
    )
    expect(nights).toBe(5)
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

  it("counts both end days for a day-counting kind instead of nights/days (F-P3-4)", () => {
    // 20 -> 23 November is a 3-night interval and a 4-Day Kruger Safari.
    expect(buildDaysLabel(3, "days")).toBe("4 Days")
    expect(buildDaysLabel(0, "days")).toBeNull()
  })

  it("keeps the nights/days format for a kind that explicitly counts nights", () => {
    expect(buildDaysLabel(2, "nights")).toBe("2 Nights / 3 Days")
  })
})

describe("selectPrimaryBlocks", () => {
  const tourBlock: VoucherServiceBlock = {
    serviceType: "tour",
    title: "Sabi Wilderness Journeys",
    supplierId: "supplier-tour",
    contactDetails: { name: "Sabi Wilderness Journeys" },
    displayOrder: 0,
    serviceData: {},
  }
  const trainAddOnBlock: VoucherServiceBlock = {
    serviceType: "train",
    title: "The Blue Train",
    supplierId: "supplier-train",
    contactDetails: { name: "The Blue Train" },
    displayOrder: 1,
    serviceData: {},
  }

  it("picks the primary supplier's own block over an add-on, regression for F-P3-2", () => {
    // The exact QA shape: a tour-headed booking with a Blue Train add-on used to print the train.
    expect(selectPrimaryBlocks([trainAddOnBlock, tourBlock], "supplier-tour", "tour_operator")).toEqual([
      tourBlock,
    ])
  })

  it("falls back to the primary kind's service type when no block matches the supplier id", () => {
    expect(selectPrimaryBlocks([trainAddOnBlock, tourBlock], "supplier-unlinked", "tour_operator")).toEqual([
      tourBlock,
    ])
  })

  it("falls back to the earliest real service block when neither the id nor the kind match", () => {
    // tourBlock has the earlier displayOrder (0) in this fixture pair.
    expect(selectPrimaryBlocks([trainAddOnBlock, tourBlock], null, null)).toEqual([tourBlock])
  })

  it("returns empty for no blocks at all", () => {
    expect(selectPrimaryBlocks([], "supplier-tour", "tour_operator")).toEqual([])
  })
})

describe("buildDeparture", () => {
  it("returns non-null for a tour-headed booking with no train block (a stay/tour used to print nothing)", () => {
    const tourBlock: VoucherServiceBlock = {
      serviceType: "tour",
      title: "Sabi Wilderness Journeys",
      contactDetails: { name: "Sabi Wilderness Journeys" },
      displayOrder: 0,
      serviceData: { numberOfSuites: 2 },
    }
    const departure = buildDeparture([tourBlock], "Your Journey", {
      tourName: null,
      durationNights: 3,
      durationUnit: "days",
      suites: 2,
      adults: 4,
      children: 0,
    })
    expect(departure).not.toBeNull()
    expect(departure?.productLabel).toBe("Tour Operator")
    expect(departure?.trainName).toBe("Sabi Wilderness Journeys")
    expect(departure?.daysLabel).toBe("4 Days")
    expect(departure?.legs).toHaveLength(1)
    expect(departure?.legs[0].heading).toBe("Your Journey")
  })

  it("returns null when nothing was priced", () => {
    expect(
      buildDeparture([], "Your Journey", {
        tourName: null,
        durationNights: null,
        durationUnit: null,
        suites: 0,
        adults: 0,
        children: 0,
      }),
    ).toBeNull()
  })

  it("renders a second train block as its own Return Journey section", () => {
    const outbound: VoucherServiceBlock = {
      serviceType: "train",
      title: "The Blue Train",
      contactDetails: { name: "The Blue Train" },
      displayOrder: 0,
      serviceData: {},
    }
    const returnLeg: VoucherServiceBlock = {
      serviceType: "train",
      title: "The Blue Train",
      contactDetails: { name: "The Blue Train" },
      displayOrder: 1,
      serviceData: {},
    }
    const departure = buildDeparture([outbound, returnLeg], "Your Journey", {
      tourName: null,
      durationNights: 2,
      durationUnit: null,
      suites: 1,
      adults: 2,
      children: 0,
    })
    expect(departure?.legs.map((leg) => leg.heading)).toEqual(["Your Journey", "Return Journey"])
  })
})
