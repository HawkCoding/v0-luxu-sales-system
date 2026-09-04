import { describe, expect, it } from "vitest"
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
      showDurationNights: true,
      originLabel: "Origin",
      destinationLabel: "Destination",
      durationLabel: "nights",
      scheduleFields: {
        dateFromLabel: "Departure date",
        dateToLabel: "Arrival date",
        timeStartLabel: "Departure time",
        timeEndLabel: "Arrival time",
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
      showDurationNights: false,
      originLabel: "Origin",
      destinationLabel: "Destination",
      durationLabel: "nights",
      scheduleFields: {
        dateFromLabel: "Check-in date",
        dateToLabel: "Check-out date",
        timeStartLabel: "Check-in time",
        timeEndLabel: "Check-out time",
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
