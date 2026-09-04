import { describe, expect, it } from "vitest"
import { isJourneyRouteKind, primaryProductOf } from "@/lib/enquiry/primary-product"
import {
  SUPPLIER_KIND_LABELS,
  SUPPLIER_VOCABULARY,
  getSupplierVocabulary,
  isCoreBookingLeg,
  isOptionalPackageLegKind,
  isTypePricedSupplier,
  type SupplierKind,
} from "@/lib/types"

/**
 * Characterization tests for the per-kind vocabulary.
 *
 * Generalising the primary-product feature to every SupplierKind rewires a long list of call sites
 * to read this record instead of branching on `kind === "hotel_property"`. The whole refactor is
 * only safe if train and hotel wording comes out the far side unchanged, so the two kinds that ship
 * today are frozen here in full. A deliberate change to either must edit this file in the same
 * commit, which puts it in the diff where a reviewer can see it.
 */

const ALL_KINDS: SupplierKind[] = [
  "train_operator",
  "hotel_property",
  "transfers",
  "vehicle_rental",
  "tour_operator",
  "airline",
]

describe("SUPPLIER_VOCABULARY — frozen kinds", () => {
  it("train_operator is unchanged", () => {
    expect(SUPPLIER_VOCABULARY.train_operator).toEqual({
      suiteType: "Suite Type",
      suiteTypePlural: "Suite Types",
      unitNoun: "suite",
      unitNounPlural: "suites",
      package: "Package",
      packagePlural: "Packages",
      route: "Route",
      routePlural: "Routes",
      sectionTitle: "Suite Types, Routes and Rates",
      sectionDescription:
        "Manage the suite types this supplier offers, the routes they cover, and period-based rates.",
      priceLabel: "per person sharing",
      routeHasLocations: true,
      routeHasDirection: true,
      routeHasDuration: true,
      routeHasSchedule: true,
      routeNameAutoDerived: true,
      showSingleSupplement: true,
      originLabel: "Origin",
      destinationLabel: "Destination",
      durationLabel: "nights",
      scheduleFields: {
        dateFromLabel: "Departure date",
        dateToLabel: "Arrival date",
        timeStartLabel: "Departure time",
        timeEndLabel: "Arrival time",
      },
      primaryProduct: {
        bookingNoun: "Journey",
        startDateLabel: "Departure Date",
        endDateLabel: null,
        endDateHintSuffix: null,
        endDateInvalidHint: null,
        routeFieldLabel: "Route / Direction",
        routeFieldPlaceholder: "e.g., Pretoria to Cape Town",
        durationUnit: null,
        capturesUnitCount: true,
        capturesHotelOption: true,
        routeRequiredForPricing: true,
      },
    })
  })

  it("hotel_property is unchanged", () => {
    expect(SUPPLIER_VOCABULARY.hotel_property).toEqual({
      suiteType: "Room Type",
      suiteTypePlural: "Room Types",
      unitNoun: "room",
      unitNounPlural: "rooms",
      package: "Season",
      packagePlural: "Seasons",
      route: "Meal Plan",
      routePlural: "Meal Plans",
      sectionTitle: "Room Types, Meal Plans and Rates",
      sectionDescription: "Manage room types, meal plans, and period-based rates.",
      priceLabel: "per room per night",
      routeHasLocations: false,
      routeHasDirection: false,
      routeHasDuration: false,
      routeHasSchedule: false,
      routeNameAutoDerived: false,
      showSingleSupplement: false,
      originLabel: "Origin",
      destinationLabel: "Destination",
      durationLabel: "nights",
      scheduleFields: {
        dateFromLabel: "Check-in date",
        dateToLabel: "Check-out date",
        timeStartLabel: "Check-in time",
        timeEndLabel: "Check-out time",
      },
      primaryProduct: {
        bookingNoun: "Stay",
        startDateLabel: "Check-in Date",
        endDateLabel: "Check-out Date",
        endDateHintSuffix: "- the stay is priced per room per night.",
        endDateInvalidHint: "Check-out must fall after check-in.",
        routeFieldLabel: null,
        routeFieldPlaceholder: null,
        durationUnit: "nights",
        capturesUnitCount: true,
        capturesHotelOption: false,
        routeRequiredForPricing: true,
      },
    })
  })
})

describe("SUPPLIER_VOCABULARY — shape", () => {
  it("covers every SupplierKind", () => {
    expect(Object.keys(SUPPLIER_VOCABULARY).sort()).toEqual([...ALL_KINDS].sort())
    expect(Object.keys(SUPPLIER_KIND_LABELS).sort()).toEqual([...ALL_KINDS].sort())
  })

  it("gives every kind a non-empty label for every noun", () => {
    for (const kind of ALL_KINDS) {
      const vocabulary = getSupplierVocabulary(kind)
      for (const field of [
        "suiteType",
        "suiteTypePlural",
        "unitNoun",
        "unitNounPlural",
        "package",
        "packagePlural",
        "route",
        "routePlural",
        "sectionTitle",
        "sectionDescription",
        "priceLabel",
        "originLabel",
        "destinationLabel",
        "durationLabel",
      ] as const) {
        expect(vocabulary[field], `${kind}.${field}`).toBeTruthy()
      }
    }
  })

  /**
   * routeHasLocations is about to become the single predicate behind "does this kind's route name a
   * real journey" -- it decides whether the booking's route_id is written and whether the enquiry
   * form offers a route field. Freezing it here means a casual edit for an unrelated admin-UI reason
   * cannot silently change how a booking's journey line resolves.
   */
  it("marks exactly the origin-to-destination kinds as having locations", () => {
    const withLocations = ALL_KINDS.filter((kind) => SUPPLIER_VOCABULARY[kind].routeHasLocations)
    expect(withLocations.sort()).toEqual(
      ["airline", "train_operator", "transfers", "vehicle_rental"].sort(),
    )
  })

  it("prices only tour operators off the type alone", () => {
    const typePriced = ALL_KINDS.filter((kind) => isTypePricedSupplier(kind))
    expect(typePriced).toEqual(["tour_operator"])
  })
})

describe("SUPPLIER_VOCABULARY — primary product", () => {
  it("gives every kind a start date label and a booking noun", () => {
    for (const kind of ALL_KINDS) {
      const product = getSupplierVocabulary(kind).primaryProduct
      expect(product.bookingNoun, `${kind}.bookingNoun`).toBeTruthy()
      expect(product.startDateLabel, `${kind}.startDateLabel`).toBeTruthy()
    }
  })

  /**
   * One fact, not two. The enquiry form offers a route field exactly when the kind's route names a
   * real journey, which is the same predicate that decides whether the booking gets a journey line.
   * Splitting them is how a meal plan ends up printed as a direction.
   */
  it("offers a route field exactly for the kinds whose route has locations", () => {
    for (const kind of ALL_KINDS) {
      const vocabulary = getSupplierVocabulary(kind)
      expect(vocabulary.primaryProduct.routeFieldLabel !== null, kind).toBe(
        vocabulary.routeHasLocations,
      )
      expect(vocabulary.primaryProduct.routeFieldPlaceholder !== null, kind).toBe(
        vocabulary.routeHasLocations,
      )
    }
  })

  it("only describes an end date for kinds that capture one", () => {
    for (const kind of ALL_KINDS) {
      const product = getSupplierVocabulary(kind).primaryProduct
      if (product.endDateLabel === null) {
        expect(product.endDateHintSuffix, kind).toBeNull()
        expect(product.endDateInvalidHint, kind).toBeNull()
        expect(product.durationUnit, kind).toBeNull()
      } else {
        expect(product.endDateInvalidHint, kind).toBeTruthy()
      }
    }
  })

  it("counts a stay in nights and a tour or rental in days", () => {
    const byUnit = Object.fromEntries(
      ALL_KINDS.map((kind) => [kind, getSupplierVocabulary(kind).primaryProduct.durationUnit]),
    )
    expect(byUnit).toEqual({
      train_operator: null,
      hotel_property: "nights",
      transfers: null,
      vehicle_rental: "days",
      tour_operator: "days",
      airline: null,
    })
  })

  // The transport kinds carry booking_transport_requests rather than booking_service_units, so
  // there is no unit count for intake to ask for.
  it("captures a unit count for every kind except the transport ones", () => {
    const without = ALL_KINDS.filter((kind) => !getSupplierVocabulary(kind).primaryProduct.capturesUnitCount)
    expect(without.sort()).toEqual(["transfers", "vehicle_rental"])
  })

  it("offers a hotel add-on to every kind except a hotel", () => {
    const without = ALL_KINDS.filter((kind) => !getSupplierVocabulary(kind).primaryProduct.capturesHotelOption)
    expect(without).toEqual(["hotel_property"])
  })

  /**
   * Frozen against today's ROUTE_REQUIRED_KINDS in lib/enquiry/build-readiness.ts. Readiness is
   * about to read this instead of its own Set; the two must agree exactly on the day of the swap.
   */
  it("requires a route for pricing on exactly the kinds readiness blocks today", () => {
    const required = ALL_KINDS.filter(
      (kind) => getSupplierVocabulary(kind).primaryProduct.routeRequiredForPricing,
    )
    expect(required.sort()).toEqual(["hotel_property", "train_operator"])
  })
})

describe("primaryProductOf / isJourneyRouteKind", () => {
  it("falls back to a rail journey when the kind is not known yet", () => {
    expect(primaryProductOf(null)).toEqual(SUPPLIER_VOCABULARY.train_operator.primaryProduct)
    expect(primaryProductOf(undefined)).toEqual(SUPPLIER_VOCABULARY.train_operator.primaryProduct)
  })

  it("returns the kind's own rules when it is known", () => {
    expect(primaryProductOf("hotel_property").bookingNoun).toBe("Stay")
    expect(primaryProductOf("tour_operator").bookingNoun).toBe("Tour")
  })

  it("treats an unknown kind as carrying no journey route", () => {
    expect(isJourneyRouteKind(null)).toBe(false)
    expect(isJourneyRouteKind(undefined)).toBe(false)
  })

  it("agrees with routeHasLocations for every known kind", () => {
    for (const kind of ALL_KINDS) {
      expect(isJourneyRouteKind(kind), kind).toBe(SUPPLIER_VOCABULARY[kind].routeHasLocations)
    }
  })
})

describe("isCoreBookingLeg", () => {
  it("uses the booking's primary supplier when one is recorded", () => {
    expect(
      isCoreBookingLeg({ supplierId: "sup-hotel", supplierKind: "hotel_property" }, "sup-hotel"),
    ).toBe(true)
    expect(
      isCoreBookingLeg({ supplierId: "sup-transfer", supplierKind: "transfers" }, "sup-hotel"),
    ).toBe(false)
  })

  it("falls back to the train rule for bookings predating the column", () => {
    expect(isCoreBookingLeg({ supplierId: "sup-train", supplierKind: "train_operator" }, null)).toBe(
      true,
    )
    expect(isCoreBookingLeg({ supplierId: "sup-hotel", supplierKind: "hotel_property" }, null)).toBe(
      false,
    )
  })
})

describe("isOptionalPackageLegKind", () => {
  it("still starts every non-train catalogue leg opt-in", () => {
    // Deliberately out of scope for the primary-product generalisation: a catalogue package has no
    // booking behind it, so there is no primary supplier to compare against.
    expect(ALL_KINDS.filter((kind) => !isOptionalPackageLegKind(kind))).toEqual(["train_operator"])
  })
})
