import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherRowsForBlock } from "@/lib/voucher/service-block-rows"
import { INVOICE_OMITTED_VOUCHER_ROWS, invoiceRowsForBlock } from "@/lib/invoices/departure-rows"

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

function labels(rows: ReturnType<typeof invoiceRowsForBlock>): string[] {
  return rows.map((row) => row.left?.label).filter((label): label is string => Boolean(label))
}

describe("invoiceRowsForBlock", () => {
  it("tour block: names the operator's rows without the reference or the itinerary prose", () => {
    const rows = invoiceRowsForBlock(
      block({
        serviceType: "tour",
        serviceData: {
          suiteType: "4-Day Kruger Safari",
          itinerary: "Kruger Itinerary",
          itineraryDescription: "Full description of the safari route.",
          departureDate: "2026-11-20",
          arrivalDate: "2026-11-23",
        },
      }),
    )
    expect(labels(rows)).toEqual(["Tour", "Itinerary", "Start Date", "End Date"])
    expect(rows.every((row) => row.left?.label !== "Details")).toBe(true)
    expect(rows.every((row) => row.left?.label !== "Your Reference")).toBe(true)
  })

  it("hotel block: room type/qty, nights, meal plan, check-in/check-out, no guest breakdown", () => {
    const rows = invoiceRowsForBlock(
      block({
        serviceType: "hotel",
        serviceData: {
          roomType: "Deluxe Room",
          numberOfSuites: 2,
          nights: 3,
          mealPlan: "Breakfast",
          departureDate: "2026-11-18",
          arrivalDate: "2026-11-21",
          guestBreakdown: { adults: 2, children: 0, infants: 0 },
        },
      }),
    )
    expect(labels(rows)).toEqual(["Room Type", "Nights", "Meal Plan", "Check-In", "Check-Out"])
    expect(rows.find((r) => r.left?.label === "Room Type")).toMatchObject({
      left: { label: "Room Type", value: "Deluxe Room" },
      right: { label: "Qty", value: "2" },
    })
    // The 3-cell Guests row is blocked, same as Your Reference.
    expect(rows.every((row) => row.left?.label !== "Guests")).toBe(true)
  })

  it("train block: route, duration, dates, suite -- no boarding/arrival point or supplier reference", () => {
    const rows = invoiceRowsForBlock(
      block({
        serviceType: "train",
        serviceData: {
          route: "Pretoria → Cape Town",
          boardingPoint: "Pretoria Station",
          arrivalPoint: "Cape Town Station",
          durationDays: 3,
          departureDate: "2026-07-20",
          startTime: "13:00",
          arrivalDate: "2026-07-22",
          endTime: "18:00",
          suiteType: "Deluxe Suite",
          numberOfSuites: 1,
        },
      }),
    )
    expect(labels(rows)).toEqual(["Route", "Duration", "Departure Date", "Arrival Date", "Suite Type"])
    expect(rows.some((r) => r.left?.label === "Boarding Point")).toBe(false)
    expect(rows.some((r) => r.left?.label === "Your Reference")).toBe(false)
  })

  // Drift guard: every label this module blocks must still be something voucherRowsForBlock
  // actually emits for some fixture -- if a voucher row gets renamed and this list isn't updated,
  // the renamed row silently reappears on the invoice instead of failing loudly here.
  it("every omitted label is a real voucherRowsForBlock label", () => {
    const fixtures: VoucherServiceBlock[] = [
      block({
        serviceType: "train",
        serviceData: {
          route: "Pretoria → Cape Town",
          boardingPoint: "Pretoria Station",
          arrivalPoint: "Cape Town Station",
          departureDate: "2026-07-20",
          requestsLine: "1st seating",
        },
      }),
      block({
        serviceType: "hotel",
        serviceData: {
          departureDate: "2026-07-20",
          guestBreakdown: { adults: 2, children: 0, infants: 0 },
          dietary: "Vegetarian",
          occasion: "Anniversary",
        },
      }),
      block({
        serviceType: "tour",
        serviceData: { itineraryDescription: "Details prose", departureDate: "2026-07-20" },
      }),
      block({
        serviceType: "airline",
        serviceData: { passengerNames: ["Jane Doe"], departureDate: "2026-07-20" },
      }),
      block({ serviceData: { notes: "Some note" } }),
    ]
    const emittedLabels = new Set(fixtures.flatMap((b) => voucherRowsForBlock(b).map((row) => row.label)))
    for (const omitted of INVOICE_OMITTED_VOUCHER_ROWS) {
      expect(emittedLabels.has(omitted)).toBe(true)
    }
  })
})
