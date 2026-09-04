import { describe, expect, it } from "vitest"
import { buildEnquiryReadiness, type BuildEnquiryReadinessInput } from "@/lib/enquiry/build-readiness"

const COMPLETE_CUSTOMER = {
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@example.com",
  phone: "0821234567",
  country: "South Africa",
}

function baseInput(overrides: Partial<BuildEnquiryReadinessInput> = {}): BuildEnquiryReadinessInput {
  return {
    services: [],
    suites: [],
    noOfSuites: 1,
    hotelOptionResolved: null,
    hotelPhase: null,
    extendStay: false,
    extraNights: null,
    additionalServicesRequested: false,
    additionalServicesDetails: null,
    packageOption: null,
    flightBookingRaw: null,
    supplierResolved: true,
    supplierRaw: "The Blue Train",
    customer: COMPLETE_CUSTOMER,
    emailImportNeedsReview: false,
    emailImportMissingFields: [],
    emailImportWarnings: [],
    emailImportDuplicateOfBookingId: null,
    emailImportReviewResolvedAt: null,
    servicesConfirmedAt: null,
    servicesConfirmedByName: null,
    autoBuildSkipReason: null,
    ...overrides,
  }
}

const TRAIN_SERVICE = {
  id: "svc-train",
  supplierId: "supplier-train",
  supplierName: "The Blue Train",
  supplierKind: "train_operator" as const,
  selected: true,
  origin: "auto" as const,
  serviceDate: "2026-10-14",
  serviceDateDisplay: "14 Oct 2026",
  nights: null,
  routeId: "route-1",
  sortOrder: 0,
  unitCount: 1,
  unitsMissingSuiteType: 0,
}

describe("buildEnquiryReadiness", () => {
  it("is not_built with no services, surfacing the intake skip reason", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [], autoBuildSkipReason: "No train operator resolved — nothing built" }),
    )

    expect(result.state).toBe("not_built")
    expect(result.autoBuildSkipReason).toBe("No train operator resolved — nothing built")
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ id: "no_services", severity: "block" }),
    )
  })

  it("is auto_built when services exist but nothing has been confirmed", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [TRAIN_SERVICE] }))
    expect(result.state).toBe("auto_built")
    expect(result.autoBuildSkipReason).toBeNull()
  })

  it("is confirmed once servicesConfirmedAt is set", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE],
        servicesConfirmedAt: "2026-08-01T10:00:00Z",
        servicesConfirmedByName: "Alex Consultant",
      }),
    )
    expect(result.state).toBe("confirmed")
    expect(result.servicesConfirmedByName).toBe("Alex Consultant")
  })

  it("flags a suite shortfall against the train leg's unit count", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [{ ...TRAIN_SERVICE, unitCount: 1 }], noOfSuites: 2 }),
    )
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "suites_short", severity: "warn" }),
    )
  })

  it("does not flag a suite shortfall when the built count already meets the enquiry", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [{ ...TRAIN_SERVICE, unitCount: 2 }], noOfSuites: 2 }),
    )
    expect(result.gaps.find((g) => g.id === "suites_short")).toBeUndefined()
  })

  it("flags unresolved suite phrases with the source wording", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        suites: [
          { suiteTypeId: null, sourcePhrase: "deluxe room with view" },
          { suiteTypeId: "suite-1", sourcePhrase: "standard" },
        ],
      }),
    )
    const gap = result.gaps.find((g) => g.id === "suites_unresolved")
    expect(gap).toBeDefined()
    expect(gap?.detail).toContain("deluxe room with view")
  })

  it("flags a requested hotel that was never built", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [TRAIN_SERVICE], hotelOptionResolved: "Table Bay Hotel" }),
    )
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "hotel_requested_not_built" }),
    )
  })

  it("does not flag a hotel gap when no hotel was requested", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [TRAIN_SERVICE] }))
    expect(result.gaps.find((g) => g.id === "hotel_requested_not_built")).toBeUndefined()
  })

  it("flags a built hotel leg that is not included in the quote", () => {
    const hotel = {
      ...TRAIN_SERVICE,
      id: "svc-hotel",
      supplierKind: "hotel_property" as const,
      selected: false,
      nights: 2,
    }
    const result = buildEnquiryReadiness(
      baseInput({ services: [TRAIN_SERVICE, hotel], hotelOptionResolved: "Table Bay Hotel" }),
    )
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "hotel_not_included" }),
    )
  })

  it("flags extra nights requested beyond what the hotel leg is booked for", () => {
    const hotel = {
      ...TRAIN_SERVICE,
      id: "svc-hotel",
      supplierKind: "hotel_property" as const,
      nights: 1,
    }
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE, hotel],
        hotelOptionResolved: "Table Bay Hotel",
        extraNights: 3,
      }),
    )
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "extra_nights_unbuilt" }),
    )
  })

  it("flags additional services requested with nothing transport/tour built", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE],
        additionalServicesRequested: true,
        additionalServicesDetails: "Airport transfer needed",
      }),
    )
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "additional_services_unbuilt" }),
    )
  })

  it("does not flag additional services once a transfer leg exists", () => {
    const transfer = { ...TRAIN_SERVICE, id: "svc-transfer", supplierKind: "transfers" as const }
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE, transfer],
        additionalServicesRequested: true,
      }),
    )
    expect(result.gaps.find((g) => g.id === "additional_services_unbuilt")).toBeUndefined()
  })

  it("surfaces an info note for a package option, which the system never reads", () => {
    const result = buildEnquiryReadiness(baseInput({ packageOption: "Cape Panorama" }))
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "package_option_unread", severity: "info" }),
    )
  })

  it("surfaces an info note for a requested flight with no airline service built", () => {
    const result = buildEnquiryReadiness(baseInput({ flightBookingRaw: "SA123 on 12 Oct" }))
    expect(result.gaps).toContainEqual(
      expect.objectContaining({ id: "flight_requested_not_built", severity: "info" }),
    )
  })

  it("flags an unresolved supplier as the customer's raw wording", () => {
    const result = buildEnquiryReadiness(
      baseInput({ supplierResolved: false, supplierRaw: "the blue one" }),
    )
    expect(result.gaps).toContainEqual(
      expect.objectContaining({
        id: "supplier_unresolved",
        // Kind-neutral: an enquiry can be for a hotel (standalone stay), not only a train.
        title: `The supplier is still the customer's wording: "the blue one".`,
      }),
    )
  })

  it("blocks when the enquiry needs review, regardless of source", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE],
        emailImportNeedsReview: true,
        emailImportMissingFields: ["Departure date"],
      }),
    )
    const blocker = result.blockers.find((b) => b.id === "needs_review")
    expect(blocker).toBeDefined()
    expect(blocker).toMatchObject({ missingFields: ["Departure date"] })
  })

  it("does not block on a resolved review flag", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE],
        emailImportNeedsReview: true,
        emailImportReviewResolvedAt: "2026-08-01T00:00:00Z",
      }),
    )
    expect(result.blockers.find((b) => b.id === "needs_review")).toBeUndefined()
  })

  it("blocks on an incomplete customer profile, naming the missing fields", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        services: [TRAIN_SERVICE],
        customer: { firstName: "Jane", lastName: null, email: null, phone: "0821234567", country: "South Africa" },
      }),
    )
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        id: "customer_incomplete",
        title: "Customer profile is missing last name, email.",
      }),
    )
  })

  it("blocks a selected service with no date", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [{ ...TRAIN_SERVICE, serviceDate: null }] }),
    )
    expect(result.blockers.some((b) => b.title === "Train has no date.")).toBe(true)
  })

  it("does not block on a date-missing service that is not selected", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [{ ...TRAIN_SERVICE, serviceDate: null, selected: false }] }),
    )
    expect(result.blockers.some((b) => b.title === "Train has no date.")).toBe(false)
  })

  it("blocks a train leg with no route", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [{ ...TRAIN_SERVICE, routeId: null }] }))
    expect(result.blockers.some((b) => b.title === "The train journey has no route.")).toBe(true)
  })

  it("blocks a leg with units missing a suite type", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [{ ...TRAIN_SERVICE, unitsMissingSuiteType: 2 }] }),
    )
    expect(result.blockers.some((b) => b.title.includes("suites have no suite type"))).toBe(true)
  })

  it("carries kindLabel and unit count through onto each service row", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [TRAIN_SERVICE] }))
    expect(result.services[0]).toMatchObject({
      kindLabel: "Train",
      unitCount: 1,
      origin: "auto",
    })
  })
})

/**
 * A lodge reuses the same tables as a train under different vocabulary: its "route" is its meal
 * plan, its "suite" is a room. Both gates were train-only, so a Kruger Shalati leg with no meal
 * plan reached pricing unflagged -- masked only because Shalati files exactly one meal plan and
 * auto-build fills it in.
 */
describe("buildEnquiryReadiness — stay suppliers", () => {
  const HOTEL_SERVICE = {
    ...TRAIN_SERVICE,
    id: "svc-hotel",
    supplierId: "supplier-hotel",
    supplierName: "Kruger Shalati - Train on the Bridge",
    supplierKind: "hotel_property" as const,
    nights: 3,
  }

  it("blocks a hotel leg with no meal plan chosen", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [{ ...HOTEL_SERVICE, routeId: null }] }))

    expect(result.services[0].issues).toContain("No meal plan chosen")
    expect(result.blockers.some((b) => b.title === "Hotel has no meal plan.")).toBe(true)
  })

  it("does not block a hotel leg that has one", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [HOTEL_SERVICE] }))

    expect(result.services[0].issues).toEqual([])
    expect(result.blockers.some((b) => b.title.includes("meal plan"))).toBe(false)
  })

  it("still calls a train's missing route a route, not a meal plan", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [{ ...TRAIN_SERVICE, routeId: null }] }))

    expect(result.services[0].issues).toContain("No route chosen")
    expect(result.blockers.some((b) => b.title === "The train journey has no route.")).toBe(true)
  })

  it("names missing unit types by the supplier's own vocabulary", () => {
    const hotel = buildEnquiryReadiness(
      baseInput({ services: [{ ...HOTEL_SERVICE, unitsMissingSuiteType: 2 }] }),
    )
    expect(hotel.services[0].issues).toContain("2 rooms have no room type")
    expect(hotel.blockers.some((b) => b.title === "Hotel: 2 rooms have no room type")).toBe(true)

    const train = buildEnquiryReadiness(
      baseInput({ services: [{ ...TRAIN_SERVICE, unitsMissingSuiteType: 2 }] }),
    )
    expect(train.services[0].issues).toContain("2 suites have no suite type")
  })

  it("uses the singular noun and verb for one unit", () => {
    const result = buildEnquiryReadiness(
      baseInput({ services: [{ ...HOTEL_SERVICE, unitsMissingSuiteType: 1 }] }),
    )
    expect(result.services[0].issues).toContain("1 room has no room type")
  })

  // A stay has no journey to add, so the empty-booking blocker must not ask for one.
  it("does not tell a booking with nothing built to add a train", () => {
    const result = buildEnquiryReadiness(baseInput({ services: [] }))
    const blocker = result.blockers.find((b) => b.id === "no_services")

    expect(blocker?.detail).toBe("The quote cannot be priced until the booking has at least one service.")
    expect(blocker?.detail).not.toContain("train")
  })

  it("leaves transfer legs alone — their route is optional", () => {
    const result = buildEnquiryReadiness(
      baseInput({
        services: [
          { ...TRAIN_SERVICE, id: "svc-transfer", supplierKind: "transfers" as const, routeId: null },
        ],
      }),
    )
    expect(result.services[0].issues).toEqual([])
  })
})
