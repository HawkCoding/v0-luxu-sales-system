import { describe, expect, it } from "vitest"
import {
  buildBillingParty,
  buildDaysLabel,
  buildDeparture,
  buildInvoiceItems,
  collapseRepeatedInvoiceItems,
  invoiceItemSchedule,
  invoiceJourneyHeading,
  numberedGuestCells,
  resolveDurationNights,
  selectPrimaryBlocks,
} from "@/lib/invoices/build-invoice-view"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import type { PricingSnapshot } from "@/lib/types"
import { carmenQuoteLines, carmenServiceBlocks } from "@/lib/pax-groups/carmen-sample.fixtures"

describe("invoice lines and guests on a booking split into pax groups", () => {
  it("tags a description line whose service only some suites take", () => {
    const items = buildInvoiceItems(carmenQuoteLines(), carmenServiceBlocks())
    const tagged = items.filter((item) => item.description.endsWith("only)"))

    expect(tagged.map((item) => item.description)).toEqual([
      "Transfer One&Only Cape Town to Cape Town International Airport (Suite 6 only)",
    ])
  })

  it("names the groups with the primary product's noun", () => {
    const items = buildInvoiceItems(carmenQuoteLines(), carmenServiceBlocks(), [], "Cabin")
    expect(items.some((item) => item.description.endsWith("(Cabin 6 only)"))).toBe(true)
  })

  it("collapses rows that print alike when the invoice prints per-suite prices", () => {
    const all = buildInvoiceItems(carmenQuoteLines(), carmenServiceBlocks())
    const collapsed = buildInvoiceItems(carmenQuoteLines(), carmenServiceBlocks(), [], "Suite", true)
    const key = (item: { date?: string | null; time?: string | null; description: string }) =>
      [item.date, item.time, item.description.replace(/\s\(Child\)/g, "")].join("|")

    expect(collapsed.length).toBeLessThan(all.length)
    // One row per date, time and service, in first-seen order, with no "(Child)" left on a merged row.
    expect(collapsed.map(key)).toEqual([...new Set(all.map(key))])
    expect(collapsed.filter((item) => item.description.includes("(Child)"))).toEqual([])
    expect(buildInvoiceItems(carmenQuoteLines(), carmenServiceBlocks(), [], "Suite", false)).toEqual(all)
  })

  it("keeps rows that differ in date, time or service, and a lone child fare's marker", () => {
    const row = (description: string, date: string | null = "2026-08-11", time: string | null = "09:00") => ({
      pax: 1,
      description,
      unitPrice: 0,
      total: 0,
      date,
      time,
    })
    expect(
      collapseRepeatedInvoiceItems([
        row("Rovos Rail — Pretoria → Cape Town"),
        row("Rovos Rail — Pretoria → Cape Town (Child)"),
        row("Rovos Rail — Pretoria → Cape Town"),
        row("Commodore Hotel", "2026-08-14", null),
        row("Commodore Hotel", "2026-08-15", null),
        row("Excursion (Child)", "2026-08-16", null),
      ]).map((item) => [item.description, item.date]),
    ).toEqual([
      ["Rovos Rail — Pretoria → Cape Town", "2026-08-11"],
      ["Commodore Hotel", "2026-08-14"],
      ["Commodore Hotel", "2026-08-15"],
      ["Excursion (Child)", "2026-08-16"],
    ])
  })

  it("numbers the guest grid by group, the unplaced last as Guest:", () => {
    const travellers = [
      { name: "Mr B", pax_group_id: "g2" },
      { name: "Mr Late", pax_group_id: null },
      { name: "Mrs A", pax_group_id: "g1" },
      { name: "Mrs B", pax_group_id: "g2" },
    ]
    const groups = [
      { id: "g1", position: 1 },
      { id: "g2", position: 2 },
    ]
    expect(numberedGuestCells(travellers, groups, (traveller) => traveller.name)).toEqual([
      { label: "Guest 1.1:", name: "Mrs A" },
      { label: "Guest 2.1:", name: "Mr B" },
      { label: "Guest 2.2:", name: "Mrs B" },
      { label: "Guest:", name: "Mr Late" },
    ])
    expect(numberedGuestCells([{ name: "Mr A", pax_group_id: null }], groups, (traveller) => traveller.name)).toBeNull()
  })
})

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
  const profile = {
    phone: "+27 21 555 0000",
    email: "customer@example.com",
    address_line1: "49 Mitchell Ave",
    address_line2: null,
    city: "Newcastle upon Tyne",
    province: null,
    postal_code: "NE1 4ST",
    country: "United Kingdom",
  }

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
      profile,
    )
    expect(billing.companyName).toBe("Acme Travel")
    expect(billing.vatNumber).toBe("VAT123")
    // The postal code is an address line of its own, under the town and above the country.
    expect(billing.addressLines).toEqual(["1 Job St", "Cape Town, Western Cape", "8001", "South Africa"])
    // Phone and e-mail are the one exception — still sourced from the customer profile.
    expect(billing.phone).toBe("+27 21 555 0000")
    expect(billing.email).toBe("customer@example.com")
  })

  it("never falls back to the customer profile for company or VAT", () => {
    const billing = buildBillingParty(null, { ...profile, address_line1: null, city: null, postal_code: null, country: null })
    expect(billing.companyName).toBeNull()
    expect(billing.vatNumber).toBeNull()
    expect(billing.addressLines).toEqual([])
    expect(billing.phone).toBe("+27 21 555 0000")
    expect(billing.email).toBe("customer@example.com")
  })

  it("prints the customer profile's address when the booking has no billing address at all", () => {
    expect(buildBillingParty(null, profile).addressLines).toEqual([
      "49 Mitchell Ave",
      "Newcastle upon Tyne",
      "NE1 4ST",
      "United Kingdom",
    ])
  })

  it("never mixes the profile's address into a booking that has any address line of its own", () => {
    const billing = buildBillingParty(
      {
        billing_company_name: null,
        billing_vat_number: null,
        billing_address_line1: null,
        billing_address_line2: null,
        billing_city: null,
        billing_province: null,
        billing_postal_code: null,
        billing_country: "South Africa",
      },
      profile,
    )
    expect(billing.addressLines).toEqual(["South Africa"])
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

  describe("a train route named something other than its endpoints", () => {
    const namedRoute: VoucherServiceBlock = {
      serviceType: "train",
      title: "Rovos Rail",
      contactDetails: {},
      displayOrder: 0,
      serviceData: { route: "Durban Safari", routeEndpoints: "Pretoria → Durban" },
    }
    const context = { durationNights: 2, durationUnit: null, suites: 1, adults: 2, children: 0 }

    it("prints the name as the Tour and the endpoints as the Route", () => {
      const departure = buildDeparture([namedRoute], "Your Journey", { ...context, tourName: "Durban Safari" })
      expect(departure?.tourName).toBe("Durban Safari")
      expect(departure?.legs[0].rows[0].left).toEqual({ label: "Route", value: "Pretoria → Durban" })
    })

    it("moves the leg's name up to Tour when the booking has no route of its own", () => {
      const departure = buildDeparture([namedRoute], "Your Journey", { ...context, tourName: null })
      expect(departure?.tourName).toBe("Durban Safari")
    })

    it("drops the Tour row when the name only restates the endpoints", () => {
      const departure = buildDeparture([namedRoute], "Your Journey", { ...context, tourName: "Durban to Pretoria" })
      expect(departure?.tourName).toBeNull()
    })
  })

  it("drops the Tour row when the booking route names the same endpoints as the leg's route", () => {
    const trainBlock: VoucherServiceBlock = {
      serviceType: "train",
      title: "The Blue Train",
      contactDetails: { name: "The Blue Train" },
      displayOrder: 0,
      serviceData: { route: "Cape Town → Pretoria" },
    }
    const departure = buildDeparture([trainBlock], "Your Journey", {
      tourName: "Pretoria ↔ Cape Town",
      durationNights: 2,
      durationUnit: null,
      suites: 1,
      adults: 2,
      children: 0,
    })
    expect(departure?.tourName).toBeNull()
  })

  it("keeps the Tour row when the route carries a name of its own", () => {
    const trainBlock: VoucherServiceBlock = {
      serviceType: "train",
      title: "Rovos Rail",
      contactDetails: { name: "Rovos Rail" },
      displayOrder: 0,
      serviceData: { route: "Pretoria → Victoria Falls" },
    }
    const departure = buildDeparture([trainBlock], "Your Journey", {
      tourName: "Pride of Africa",
      durationNights: 2,
      durationUnit: null,
      suites: 1,
      adults: 2,
      children: 0,
    })
    expect(departure?.tourName).toBe("Pride of Africa")
  })
})

describe("invoiceItemSchedule", () => {
  const transfer = (startTime: string, route: string, displayOrder: number): VoucherServiceBlock => ({
    serviceType: "transfer",
    title: "Transfer",
    supplierId: "s-transfers",
    contactDetails: {},
    displayOrder,
    serviceData: { departureDate: "2027-03-25", startTime, route },
  })
  const snapshot = (partial: Partial<PricingSnapshot>) => ({ travelDate: "2027-03-25", supplierId: "s-transfers", ...partial }) as PricingSnapshot

  it("dates a line by its travel date and times it from the one service it priced", () => {
    expect(invoiceItemSchedule(snapshot({}), [transfer("11:00", "PTY – STA APT", 0)])).toEqual({
      date: "2027-03-25",
      time: "11:00",
    })
  })

  it("tells two same-day services from one supplier apart by the route the line priced", () => {
    const blocks = [transfer("11:00", "PTY – STA APT", 0), transfer("17:00", "PTY – PHTL APT", 1)]

    expect(invoiceItemSchedule(snapshot({ routeName: "PTY – PHTL APT" }), blocks).time).toBe("17:00")
  })

  it("prints the date alone rather than guess between two times", () => {
    const blocks = [transfer("11:00", "Same", 0), transfer("17:00", "Same", 1)]

    expect(invoiceItemSchedule(snapshot({ routeName: "Same" }), blocks)).toEqual({ date: "2027-03-25", time: null })
  })

  it("leaves a line without a travel date undated", () => {
    expect(invoiceItemSchedule(null, [])).toEqual({ date: null, time: null })
  })
})

describe("buildInvoiceItems", () => {
  const base = {
    source: "pricing_engine",
    pricingMode: "rate_card",
    packageId: "package-1",
    packageName: "Booking",
    routeId: "route-1",
    suiteTypeId: null,
    suiteTypeName: null,
    rateCardId: null,
    passengerKind: "adult",
    baseUnitPrice: 0,
    markupPct: 0,
    singleSupplementPct: null,
  } as const

  describe("a train line", () => {
    const trainLine = {
      description: "Rovos Rail - Durban Safari - Adult",
      qty: 2,
      unit_price: 10_000,
      total: 20_000,
      pricing_snapshot: {
        ...base,
        legId: "service-train",
        legLabel: "Rovos Rail",
        supplierId: "supplier-rovos",
        supplierName: "Rovos Rail",
        supplierKind: "train_operator",
        routeName: "Durban Safari",
        travelDate: "2027-05-14",
        serviceType: null,
      } satisfies PricingSnapshot,
    }
    const leg = (serviceData: VoucherServiceBlock["serviceData"], supplierId = "supplier-rovos"): VoucherServiceBlock => ({
      serviceType: "train",
      title: "Rovos Rail",
      supplierId,
      contactDetails: {},
      displayOrder: 0,
      serviceData: { departureDate: "2027-05-14", startTime: "10:00", ...serviceData },
    })

    it("names the leg's endpoints instead of the route's own name, keeping its time", () => {
      const [item] = buildInvoiceItems([trainLine], [leg({ route: "Durban Safari", routeEndpoints: "Pretoria → Durban" })])
      expect(item.description).toBe("Rovos Rail — Pretoria → Durban")
      expect(item.time).toBe("10:00")
    })

    it("keeps the route's name when the leg has no endpoints", () => {
      const [item] = buildInvoiceItems([trainLine], [leg({ route: "Durban Safari", routeEndpoints: null })])
      expect(item.description).toBe("Rovos Rail — Durban Safari")
    })

    it("ignores another operator's route of the same name", () => {
      const other = leg({ route: "Durban Safari", routeEndpoints: "Cape Town → Durban" }, "supplier-other")
      expect(buildInvoiceItems([trainLine], [other])[0].description).toBe("Rovos Rail — Durban Safari")
    })
  })

  // The two rows from the client's screenshot: a hotel with its first night gifted, and a comped
  // transfer whose route record is named by a short code.
  const hotelLine = {
    description: "DaVinci Hotel & Suites - Bed & Breakfast — Deluxe Room",
    qty: 2,
    unit_price: 3_500,
    total: 7_000,
    pricing_snapshot: {
      ...base,
      legId: "service-hotel",
      legLabel: "DaVinci Hotel & Suites",
      supplierId: "supplier-hotel",
      supplierName: "DaVinci Hotel & Suites",
      supplierKind: "hotel_property",
      routeName: "Bed & Breakfast",
      suiteTypeName: "Deluxe Room",
      travelDate: "2027-11-20",
      serviceType: null,
      complimentaryNights: 1,
      stayNights: 3,
    },
  }
  const transferLine = (snapshot: Pick<Partial<PricingSnapshot>, "isComplimentaryTransport" | "transportRequestId"> = {}) => ({
    description: "Ulysses Tours & Transfers - Transfer",
    qty: 1,
    unit_price: 950,
    total: 0,
    pricing_snapshot: {
      ...base,
      legId: "service-transfer",
      legLabel: "Ulysses Tours & Transfers",
      supplierId: "supplier-transfers",
      supplierName: "Ulysses Tours & Transfers",
      supplierKind: "transfers",
      routeName: "PTY - PHTL STA",
      travelDate: "2027-11-22",
      serviceType: "transfer",
      isComplimentaryTransport: true,
      transportRequestId: "request-1",
      ...snapshot,
    },
  })
  const tripRequest = {
    id: "request-1",
    service_id: "service-transfer",
    service_type: "transfer",
    suite_type_id: null,
    pickup_point: "Sandton Hotel",
    dropoff_point: "Pretoria Station",
    pickup_at: "2027-11-22T09:00:00+00:00",
  }

  it("prints neither comp suffix, and names the transfer by its pick-up and drop-off", () => {
    const items = buildInvoiceItems([hotelLine, transferLine()], [], [tripRequest])
    expect(items.map((item) => item.description)).toEqual([
      "DaVinci Hotel & Suites — Deluxe Room, Bed & Breakfast (3 nights)",
      "Transfer Sandton Hotel to Pretoria Station",
    ])
    // Wording only: the qty and money columns are untouched.
    expect(items.map(({ pax, unitPrice, total }) => ({ pax, unitPrice, total }))).toEqual([
      { pax: 2, unitPrice: 3_500, total: 7_000 },
      { pax: 1, unitPrice: 950, total: 0 },
    ])
  })

  it("names an older charged transfer line (no request id stamped) by its service's trip", () => {
    const line = transferLine({ isComplimentaryTransport: undefined, transportRequestId: undefined })
    expect(buildInvoiceItems([line], [], [tripRequest])[0].description).toBe(
      "Transfer Sandton Hotel to Pretoria Station",
    )
  })

  it("falls back to the route name when no trip is supplied", () => {
    expect(buildInvoiceItems([transferLine()])[0].description).toBe("Transfer PTY - PHTL STA")
  })
})

describe("invoiceJourneyHeading", () => {
  it("names a rail booking's journey as the template does", () => {
    expect(invoiceJourneyHeading("Your Journey", "train_operator")).toBe("Your Train Journey")
  })

  it("keeps the stock wording for every other product", () => {
    expect(invoiceJourneyHeading("Your Journey", "hotel_property")).toBe("Your Journey")
    expect(invoiceJourneyHeading(null, null)).toBe("Your Journey")
  })

  it("prints an admin's own heading exactly as typed", () => {
    expect(invoiceJourneyHeading("Your Rail Adventure", "train_operator")).toBe("Your Rail Adventure")
  })
})
