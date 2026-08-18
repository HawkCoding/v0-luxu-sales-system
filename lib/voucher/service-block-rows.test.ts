import { describe, expect, it } from "vitest"
import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { voucherProviderContactLine, voucherRowsForBlock } from "@/lib/voucher/service-block-rows"
import { sampleVoucherServiceBlocks } from "@/lib/voucher/pdf/sample-data"

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

  it("train block: never prints an Excursion row, even when excursions data is present; the footnote is not a table row either", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: {
          excursions: ["Kimberley **Weather & Time Permitted"],
          footnote: "Check in IRENE COUNTRY LODGE 2h prior to departure",
        },
      }),
    )
    expect(rows.some((r) => r.label === "Excursion")).toBe(false)
    // The footnote is printed by the renderers directly from `block.serviceData.footnote` as an
    // italic line under the table, not as a labelled row — see sections/service-block.tsx.
    expect(rows.some((r) => r.label === "Note")).toBe(false)
  })

  it("train block: prints Boarding Point and Arrival Point straight after the Route", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: {
          route: "Pretoria → Cape Town",
          boardingPoint: "Rovos Rail Station, Capital Park, Pretoria",
          arrivalPoint: "Cape Town Station, Adderley Street",
        },
      }),
    )
    expect(labels(rows).slice(0, 4)).toEqual([
      "Your Reference",
      "Route",
      "Boarding Point",
      "Arrival Point",
    ])
    expect(rows.find((r) => r.label === "Boarding Point")?.value).toBe(
      "Rovos Rail Station, Capital Park, Pretoria",
    )
  })

  it("train block: omits either station row when that side has no address", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "train",
        serviceData: { route: "Pretoria → Cape Town", boardingPoint: "Rovos Rail Station" },
      }),
    )
    expect(labels(rows)).toContain("Boarding Point")
    expect(labels(rows)).not.toContain("Arrival Point")
  })

  it("hotel block: never prints station rows even when the data carries them", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "hotel",
        serviceData: { boardingPoint: "Cape Town Station", arrivalPoint: "Rovos Rail Station" },
      }),
    )
    expect(labels(rows)).not.toContain("Boarding Point")
    expect(labels(rows)).not.toContain("Arrival Point")
  })

  // The Templates design preview and the sample PDF downloads render from this fixture. It used to
  // carry no station rows, so a manager tuning the voucher layout never saw the two longest rows a
  // real train block prints.
  it("the design-preview sample train block carries the same station rows a real voucher prints", () => {
    const sampleTrainBlock = sampleVoucherServiceBlocks().find((b) => b.serviceType === "train")
    expect(sampleTrainBlock).toBeDefined()

    const rows = voucherRowsForBlock(sampleTrainBlock!)
    expect(labels(rows)).toContain("Boarding Point")
    expect(labels(rows)).toContain("Arrival Point")
    // Boarding is the route's origin, arrival its destination -- a preview that had them the wrong
    // way round would teach the wrong layout.
    expect(sampleTrainBlock!.serviceData.route).toBe("Cape Town → Pretoria")
    expect(rows.find((r) => r.label === "Boarding Point")?.value).toContain("Cape Town")
    expect(rows.find((r) => r.label === "Arrival Point")?.value).toContain("Pretoria")
  })

  it("airline block: dates fold in the airport code, plus baggage cells and priority boarding", () => {
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
    expect(rows.find((r) => r.label === "Departure")?.value).toBe("11 September 2026: CPT at 16h20")
    expect(rows.find((r) => r.label === "Arrival")?.value).toBe("11 September 2026: JNB at 18h25")
    expect(rows.some((r) => r.label === "Departure Airport")).toBe(false)
    expect(rows.some((r) => r.label === "Arrival Airport")).toBe(false)
    expect(rows.find((r) => r.label === "Baggage")?.cells).toEqual([
      { label: "Hand Luggage", value: "7kg" },
      { label: "Checked-in Luggage", value: "20kg" },
    ])
    expect(rows.find((r) => r.label === "Priority Boarding")?.value).toBe("Yes")
  })

  it("airline block: prints numbered Passengers when names are captured", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "airline",
        serviceData: { passengerNames: ["Hans Ntshele Makweng", "Manini Florence Theletsane"] },
      }),
    )
    expect(rows.find((r) => r.label === "Passengers")?.value).toBe(
      "1.1 Hans Ntshele Makweng  1.2 Manini Florence Theletsane",
    )
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

  it("train block: folds startTime/endTime into the date rows, and prints guests/requests/inclusions", () => {
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
          // Occasion is hotel-only now — set here to confirm the train branch ignores it.
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
    expect(rows.find((r) => r.label === "Occasion")).toBeUndefined()
  })

  it("train block: drops Route and Suite Type entirely when unset, instead of printing an em dash", () => {
    const rows = voucherRowsForBlock(
      block({ serviceType: "train", serviceData: { departureDate: "2026-08-21" } }),
    )
    expect(rows.some((r) => r.label === "Route")).toBe(false)
    expect(rows.some((r) => r.label === "Suite Type")).toBe(false)
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

  it("hotel block: prints dietary and occasion, not the train-only requests line", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "hotel",
        serviceData: {
          roomType: "Milkwood Room",
          dietary: "Vegetarian",
          occasion: "Birthday Celebration",
          // Requests (seating/smoking) is train-only — set here to confirm the hotel branch ignores it.
          requestsLine: "1st seating meals; Nonsmoking",
        },
      }),
    )
    expect(rows.find((r) => r.label === "Dietary")?.value).toBe("Vegetarian")
    expect(rows.find((r) => r.label === "Occasion")?.value).toBe("Birthday Celebration")
    expect(rows.find((r) => r.label === "Requests")).toBeUndefined()
  })

  it("transfer block: prints No of Guests from passengerCount right after the reference", () => {
    const rows = voucherRowsForBlock(
      block({ serviceType: "transfer", serviceData: { passengerCount: 2, pickup: "Hotel" } }),
    )
    expect(labels(rows).slice(0, 2)).toEqual(["Your Reference", "No of Guests"])
    expect(rows.find((r) => r.label === "No of Guests")?.value).toBe("2 Adults")
  })

  it("transfer block: falls back to the leg's route name when the trip has no pickup or drop-off", () => {
    const rows = voucherRowsForBlock(
      block({ serviceType: "transfer", serviceData: { route: "Cape Town Station > Portswood Hotel" } }),
    )
    expect(rows.find((r) => r.label === "Route")?.value).toBe("Cape Town Station > Portswood Hotel")
  })

  it("transfer block: never prints Route alongside a typed pickup or drop-off", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "transfer",
        serviceData: { route: "Cape Town Station > Portswood Hotel", pickup: "Hotel Lobby" },
      }),
    )
    expect(rows.some((r) => r.label === "Route")).toBe(false)
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

  it("transfer block: folds date, pickup point and time into a single Pick Up row", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "transfer",
        serviceData: { pickup: "The Blue Train Station", departureDate: "2026-09-09", startTime: "18:00" },
      }),
    )
    const pickUpRow = rows.find((r) => r.label === "Pick Up")
    expect(pickUpRow?.value).toBe("09 September 2026: The Blue Train Station at 18h00")
    expect(rows.some((r) => r.label === "Date")).toBe(false)
    expect(rows.some((r) => r.label === "Pickup")).toBe(false)
    expect(rows.some((r) => r.label === "Pickup Time")).toBe(false)
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

  it("tour block: names the priced tour type and the itinerary's own copy", () => {
    const rows = voucherRowsForBlock(
      block({
        serviceType: "tour",
        serviceData: {
          suiteType: "Classic Hop-on-Hop-off Ticket",
          itinerary: "Cape Town - One Day Pass",
          itineraryDescription: "Red route, 15 stops, hop off as often as you like.",
          departureDate: "2026-09-08",
        },
      }),
    )
    expect(labels(rows)).toEqual([
      "Your Reference",
      "Tour",
      "Itinerary",
      "Details",
      "Start Date",
    ])
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
  it("joins phone, email and location with a bullet for a hotel block", () => {
    const line = voucherProviderContactLine(
      {
        phone: "084 604 1454",
        email: "ops@theroyalportfolio.co.za",
        location: "Cape Town",
      },
      "hotel",
    )
    expect(line).toBe("Tel: 084 604 1454 • Email: ops@theroyalportfolio.co.za • Cape Town")
  })

  it("returns null when no contact fields are set", () => {
    expect(voucherProviderContactLine({}, "hotel")).toBeNull()
  })

  it("omits missing parts without leaving stray separators", () => {
    expect(voucherProviderContactLine({ phone: "084 604 1454" }, "hotel")).toBe("Tel: 084 604 1454")
  })

  it("includes the website after email, matching the legacy voucher's FlySafair contact line", () => {
    const line = voucherProviderContactLine(
      {
        phone: "087 357 0030",
        email: undefined,
        website: "flysafair.co.za",
      },
      "airline",
    )
    expect(line).toBe("Tel: 087 357 0030 • flysafair.co.za")
  })

  it("folds an emergency number and street address in for a hotel, matching the legacy voucher's header line", () => {
    const line = voucherProviderContactLine(
      {
        phone: "012 653 0018",
        emergencyPhone: "082 904 5780",
        streetAddress: "5 Johannes Drive",
        location: "Hennops Park, Gauteng",
      },
      "hotel",
    )
    expect(line).toBe("Tel: 012 653 0018 – Emergency: 082 904 5780 • 5 Johannes Drive, Hennops Park, Gauteng")
  })

  it("prints a tour operator's address — it's the only location a tour block has", () => {
    const line = voucherProviderContactLine(
      {
        phone: "021 555 1234",
        streetAddress: "4 Loop Street",
        location: "Cape Town City Centre",
      },
      "tour",
    )
    expect(line).toBe("Tel: 021 555 1234 • 4 Loop Street, Cape Town City Centre")
  })

  it.each(["train", "transfer", "airline"] as const)(
    "omits the supplier address for a %s block — the guest never goes there",
    (serviceType) => {
      const line = voucherProviderContactLine(
        {
          phone: "012 653 0018",
          email: "res@supplier.co.za",
          streetAddress: "5 Johannes Drive",
          location: "Hennops Park, Gauteng",
        },
        serviceType,
      )
      expect(line).toBe("Tel: 012 653 0018 • Email: res@supplier.co.za")
    },
  )
})
