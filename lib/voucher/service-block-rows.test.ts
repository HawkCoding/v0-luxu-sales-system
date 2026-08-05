import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherProviderContactLine, voucherRowsForBlock } from "@/lib/voucher/service-block-rows"

// Both the react-pdf voucher and the HTML template-editor preview render from
// voucherRowsForBlock — this is the single regression net that keeps them in sync.
// If this file passes, the two documents cannot silently diverge again.

function block(partial: Partial<VoucherServiceBlock>): VoucherServiceBlock {
  return {
    serviceType: "train",
    title: "Test Block",
    supplierReference: "REF-1",
    contactDetails: {},
    serviceData: {},
    displayOrder: 0,
    ...partial,
  }
}

function labels(rows: ReturnType<typeof voucherRowsForBlock>): string[] {
  return rows.map((row) => row.label)
}

describe("voucherRowsForBlock", () => {
  it("prints Your Reference first, falling back to an em dash when unset", () => {
    const rows = voucherRowsForBlock(block({ supplierReference: null }))
    expect(rows[0]).toEqual({ label: "Your Reference", value: "—" })
  })

  it("folds the leg's contact name into Your Reference, matching the legacy '38562 - Carla' style", () => {
    const rows = voucherRowsForBlock(block({ supplierReference: "38562", supplierContactName: "Carla" }))
    expect(rows[0]).toEqual({ label: "Your Reference", value: "38562 – Carla" })
  })

  it("train block: prints an Excursion row and a footnote Note row when present", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: {
          excursions: ["Kimberley **Weather & Time Permitted"],
          footnote: "Check in IRENE COUNTRY LODGE 2h prior to departure",
        },
      }),
    )
    expect(rows.find((r) => r.label === "Excursion")?.value).toBe("Kimberley **Weather & Time Permitted")
    expect(rows.find((r) => r.label === "Note")?.value).toBe("Check in IRENE COUNTRY LODGE 2h prior to departure")
  })

  it("airline block: airports, times, baggage cells, and priority boarding", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "airline",
        serviceData: {
          departureAirportCode: "CPT",
          arrivalAirportCode: "JNB",
          departureDate: "2026-09-11",
          startTime: "16:20",
          arrivalDate: "2026-09-11",
          endTime: "18:25",
          handLuggageKg: 7,
          checkedLuggageKg: 20,
          priorityBoarding: true,
        },
      }),
    )
    expect(rows.find((r) => r.label === "Departure")?.value).toBe("11 September 2026 at 16h20")
    expect(rows.find((r) => r.label === "Baggage")?.cells).toEqual([
      { label: "Hand Luggage", value: "7kg" },
      { label: "Checked-in Luggage", value: "20kg" },
    ])
    expect(rows.find((r) => r.label === "Priority Boarding")?.value).toBe("Yes")
  })

  it("train block: route, duration, dates, suite, meal basis in order", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: {
          route: "Pretoria → Cape Town",
          durationDays: 2,
          departureDate: "2026-09-07",
          arrivalDate: "2026-09-09",
          suiteType: "Twin bedded Deluxe Suite with a shower",
          numberOfSuites: 1,
          mealPlan: "All inclusive",
        },
      }),
    )
    expect(labels(rows)).toEqual([
      "Your Reference",
      "Route",
      "Duration",
      "Departure Date",
      "Arrival Date",
      "Suite Type",
      "Meal Basis",
    ])
    expect(rows.find((r) => r.label === "Duration")?.value).toBe("2 days")
  })

  it("train block: suite type and quantity table together as a single two-cell row", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: { suiteType: "Twin bedded Deluxe Suite with a shower", numberOfSuites: 1 },
      }),
    )
    const suiteRow = rows.find((r) => r.label === "Suite Type")
    expect(suiteRow?.cells).toEqual([
      { label: "Suite Type", value: "Twin bedded Deluxe Suite with a shower" },
      { label: "Qty", value: 1 },
    ])
    expect(suiteRow?.value).toBeUndefined()
  })

  it("train block: suite type prints as a plain single-value row when no unit count is known", () => {
    const rows = voucherRowsForBlock(block({ serviceType: "train", serviceData: { suiteType: "Royal Suite" } }))
    const suiteRow = rows.find((r) => r.label === "Suite Type")
    expect(suiteRow).toEqual({ label: "Suite Type", value: "Royal Suite" })
  })

  it("train block: folds startTime/endTime into the date rows, and prints guests/requests/occasion/inclusions", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: {
          route: "Pretoria → Cape Town",
          departureDate: "2026-09-07",
          startTime: "13:00",
          arrivalDate: "2026-09-09",
          endTime: "18:00",
          suiteType: "Twin bedded Deluxe Suite with a shower",
          guestBreakdown: { adults: 2, children: 0, infants: 0 },
          mealPlan: "All inclusive",
          inclusions: ["High Tea", "Butler service"],
          requestsLine: "1st seating meals; Nonsmoking",
          occasion: "Birthday Celebration",
        },
      }),
    )
    expect(rows.find((r) => r.label === "Departure Date")?.value).toBe("07 September 2026 at 13h00")
    expect(rows.find((r) => r.label === "Arrival Date")?.value).toBe("09 September 2026 at 18h00")
    expect(rows.find((r) => r.label === "Guests")?.cells).toEqual([
      { label: "Adults", value: 2 },
      { label: "Children", value: 0 },
      { label: "Infant", value: 0 },
    ])
    expect(rows.find((r) => r.label === "Included")?.value).toBe("High Tea, Butler service")
    expect(rows.find((r) => r.label === "Requests")?.value).toBe("1st seating meals; Nonsmoking")
    expect(rows.find((r) => r.label === "Occasion")?.value).toBe("Birthday Celebration")
  })

  it("train block: arrival date falls back to TBC when unresolved", () => {
    const rows = voucherRowsForBlock(block({ serviceType: "train", serviceData: { route: "A → B" } }))
    expect(rows.find((r) => r.label === "Arrival Date")?.value).toBe("TBC")
  })

  it("hotel block: check-in/check-out fold in the default times, room type tables with qty, guests row present", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "hotel",
        serviceData: {
          roomType: "Milkwood Room",
          numberOfSuites: 1,
          nights: 1,
          departureDate: "2026-09-09",
          startTime: "14:00",
          arrivalDate: "2026-09-11",
          endTime: "11:00",
          guestBreakdown: { adults: 2, children: 0, infants: 0 },
        },
      }),
    )
    expect(rows.find((r) => r.label === "Room Type")?.cells).toEqual([
      { label: "Room Type", value: "Milkwood Room" },
      { label: "Qty", value: 1 },
    ])
    expect(rows.find((r) => r.label === "Check-In")?.value).toBe("09 September 2026 at 14h00")
    expect(rows.find((r) => r.label === "Check-Out")?.value).toBe("11 September 2026 at 11h00")
    expect(rows.find((r) => r.label === "Guests")?.cells?.[0]).toEqual({ label: "Adults", value: 2 })
  })

  it("transfer block: prints No of Guests from passengerCount right after the reference", () => {
    const rows = voucherRowsForBlock(
      block({ serviceType: "transfer", serviceData: { passengerCount: 2, pickup: "Hotel" } }),
    )
    expect(labels(rows).slice(0, 2)).toEqual(["Your Reference", "No of Guests"])
    expect(rows.find((r) => r.label === "No of Guests")?.value).toBe("2 Adults")
  })

  it("hotel block: only prints rows for fields actually present", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "hotel",
        serviceData: { roomType: "Milkwood Room", nights: 1, departureDate: "2026-09-09" },
      }),
    )
    expect(labels(rows)).toEqual(["Your Reference", "Room Type", "Nights", "Check-In"])
  })

  it("transfer block: composes Return from arrival date + end time", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "transfer",
        serviceData: {
          pickup: "12 Apostles Hotel",
          dropoff: "Cape Town INT Airport",
          departureDate: "2026-09-11",
          startTime: "12:30",
          arrivalDate: "2026-09-11",
          endTime: "14:00",
        },
      }),
    )
    const returnRow = rows.find((r) => r.label === "Return")
    expect(returnRow?.value).toContain("14:00")
  })

  it("tour block: itinerary + start/end dates", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "tour",
        serviceData: { itinerary: "Kimberley day excursion", departureDate: "2026-09-08" },
      }),
    )
    expect(labels(rows)).toEqual(["Your Reference", "Itinerary", "Start Date"])
  })

  it("airline block: route, cabin, flight, departure, arrival", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "airline",
        serviceData: {
          route: "Cape Town → OR Tambo",
          cabin: "Economy",
          flightNumber: "FA-120",
          departureDate: "2026-09-11",
          arrivalDate: "2026-09-11",
        },
      }),
    )
    expect(labels(rows)).toEqual(["Your Reference", "Route", "Cabin", "Flight", "Departure", "Arrival"])
  })

  it("additional_service block: only reference and notes, no type-specific rows", () => {
    const rows = voucherRowsForBlock(
      block({ serviceType: "additional_service", serviceData: { notes: "Birthday cake on arrival" } }),
    )
    expect(labels(rows)).toEqual(["Your Reference", "Notes"])
  })

  it("no longer appends a Contact row — contact details print in the provider header instead", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "additional_service",
        serviceData: { notes: "Some note" },
        contactDetails: { phone: "084 604 1454", email: "ops@bluetrain.co.za", location: "Pretoria" },
      }),
    )
    expect(rows.some((r) => r.label === "Contact")).toBe(false)
    expect(labels(rows)).toEqual(["Your Reference", "Notes"])
  })
})

describe("voucherProviderContactLine", () => {
  it("joins phone, email and location with a bullet", () => {
    const line = voucherProviderContactLine({
      phone: "084 604 1454",
      email: "ops@bluetrain.co.za",
      location: "Pretoria",
    })
    expect(line).toBe("Tel: 084 604 1454 • Email: ops@bluetrain.co.za • Pretoria")
  })

  it("returns null when no contact fields are set", () => {
    expect(voucherProviderContactLine({})).toBeNull()
  })

  it("omits missing parts without leaving stray separators", () => {
    expect(voucherProviderContactLine({ phone: "084 604 1454" })).toBe("Tel: 084 604 1454")
  })

  it("folds an emergency number and street address in, matching the legacy voucher's header line", () => {
    const line = voucherProviderContactLine({
      phone: "012 653 0018",
      emergencyPhone: "082 904 5780",
      streetAddress: "5 Johannes Drive",
      location: "Hennops Park, Gauteng",
    })
    expect(line).toBe("Tel: 012 653 0018 – Emergency: 082 904 5780 • 5 Johannes Drive, Hennops Park, Gauteng")
  })
})
