import { describe, expect, it } from "vitest"
import type { PackageDetail } from "@/lib/types"
import type { ApplyLegState, SuiteLegState, TransportLegState } from "@/lib/packages/apply-dialog-state"
import {
  dateOnly,
  deriveTripDateRange,
  deriveTripDateRangeFromStates,
  nightsBetween,
  serviceDateSpan,
} from "@/lib/packages/trip-date-range"

describe("deriveTripDateRange", () => {
  it("returns min start and max end across spans", () => {
    expect(
      deriveTripDateRange([
        { start: "2026-07-18", end: "2026-07-20" },
        { start: "2026-07-16", end: "2026-07-18" },
        { start: "2026-07-20", end: "2026-07-20" },
      ]),
    ).toEqual({ start: "2026-07-16", end: "2026-07-20" })
  })

  it("returns nulls when nothing is dated", () => {
    expect(deriveTripDateRange([])).toEqual({ start: null, end: null })
  })

  it("clamps an inverted span end to its start", () => {
    expect(deriveTripDateRange([{ start: "2026-07-18", end: "2026-07-10" }])).toEqual({
      start: "2026-07-18",
      end: "2026-07-18",
    })
  })

  it("ignores malformed dates", () => {
    expect(
      deriveTripDateRange([
        { start: "not-a-date", end: "2026-07-20" },
        { start: "2026-07-16", end: "2026-07-17" },
      ]),
    ).toEqual({ start: "2026-07-16", end: "2026-07-17" })
  })
})

describe("nightsBetween", () => {
  it("counts whole nights", () => {
    expect(nightsBetween("2026-07-16", "2026-07-20")).toBe(4)
  })

  it("returns null for missing or inverted ranges", () => {
    expect(nightsBetween(null, "2026-07-20")).toBeNull()
    expect(nightsBetween("2026-07-20", "2026-07-16")).toBeNull()
  })
})

describe("dateOnly", () => {
  it("extracts the date part of a timestamp", () => {
    expect(dateOnly("2026-08-20T14:00:00+00:00")).toBe("2026-08-20")
  })

  it("returns null for empty or malformed values", () => {
    expect(dateOnly(null)).toBeNull()
    expect(dateOnly("soon")).toBeNull()
  })
})

describe("serviceDateSpan", () => {
  it("spans a hotel stay check-in to check-out", () => {
    expect(
      serviceDateSpan({ supplierKind: "hotel_property", serviceDate: "2026-07-16", nights: 2, routeDurationDays: null }),
    ).toEqual({ start: "2026-07-16", end: "2026-07-18" })
  })

  it("spans a train departure to arrival using route duration", () => {
    expect(
      serviceDateSpan({ supplierKind: "train_operator", serviceDate: "2026-07-18", nights: null, routeDurationDays: 3 }),
    ).toEqual({ start: "2026-07-18", end: "2026-07-20" })
  })

  it("treats a missing duration as a single-day service", () => {
    expect(
      serviceDateSpan({ supplierKind: "tour_operator", serviceDate: "2026-07-18", nights: null, routeDurationDays: null }),
    ).toEqual({ start: "2026-07-18", end: "2026-07-18" })
  })

  it("returns null without a service date", () => {
    expect(
      serviceDateSpan({ supplierKind: "train_operator", serviceDate: null, nights: null, routeDurationDays: 3 }),
    ).toBeNull()
  })

  it("ends an overnight flight on its captured arrival date", () => {
    expect(
      serviceDateSpan({
        supplierKind: "airline",
        serviceDate: "2026-10-14",
        nights: null,
        routeDurationDays: null,
        arrivalDate: "2026-10-15",
      }),
    ).toEqual({ start: "2026-10-14", end: "2026-10-15" })
  })

  it("lets a captured arrival date beat a route duration", () => {
    expect(
      serviceDateSpan({
        supplierKind: "airline",
        serviceDate: "2026-10-14",
        nights: null,
        routeDurationDays: 3,
        arrivalDate: "2026-10-14",
      }),
    ).toEqual({ start: "2026-10-14", end: "2026-10-14" })
  })

  it("ignores an inverted arrival date rather than producing a backwards span", () => {
    expect(
      serviceDateSpan({
        supplierKind: "airline",
        serviceDate: "2026-10-14",
        nights: null,
        routeDurationDays: null,
        arrivalDate: "2026-10-13",
      }),
    ).toEqual({ start: "2026-10-14", end: "2026-10-14" })
  })
})

function makeDetail(legs: Array<{ id: string; routes?: Array<{ id: string; durationDays?: number | null }> }>): PackageDetail {
  return {
    legs: legs.map((leg, index) => ({
      id: leg.id,
      packageId: "pkg",
      supplierId: `supplier-${index}`,
      supplierName: `Supplier ${index}`,
      supplierDescription: null,
      supplierKind: "train_operator",
      label: null,
      sortOrder: index,
      dateAnchor: null,
      routes: (leg.routes ?? []).map((route) => ({
        id: route.id,
        supplierId: `supplier-${index}`,
        name: "Route",
        originLocationId: null,
        destinationLocationId: null,
        durationDays: route.durationDays ?? null,
        active: true,
        createdAt: "",
        updatedAt: "",
      })),
      rateCards: [],
      suiteTypes: [],
    })),
  } as unknown as PackageDetail
}

function suiteState(overrides: Partial<SuiteLegState> & { legId: string }): SuiteLegState {
  return {
    kind: "suite",
    supplierKind: "train_operator",
    selected: true,
    routeId: null,
    reversed: false,
    serviceDate: null,
    nights: null,
    departureTime: null,
    arrivalDate: null,
    arrivalTime: null,
    flightNumber: null,
    departureAirportCode: null,
    arrivalAirportCode: null,
    handLuggageKg: null,
    checkedLuggageKg: null,
    dateAnchor: null,
    notes: null,
    rateTypeId: null,
    priceCurrency: "ZAR",
    units: [],
    bookingDate: null,
    confirmationDate: null,
    paymentMadeDate: null,
    paidWith: null,
    origin: "consultant",
    ...overrides,
  }
}

describe("deriveTripDateRangeFromStates", () => {
  it("combines train, hotel and rental spans; earliest start wins, latest end wins", () => {
    const detail = makeDetail([{ id: "train", routes: [{ id: "route-1", durationDays: 3 }] }, { id: "hotel" }, { id: "rental" }])
    const states: ApplyLegState[] = [
      suiteState({ legId: "train", routeId: "route-1", serviceDate: "2026-07-18" }),
      suiteState({ legId: "hotel", supplierKind: "hotel_property", serviceDate: "2026-07-16", nights: 2 }),
      {
        kind: "transport",
        legId: "rental",
        supplierKind: "vehicle_rental",
        selected: true,
        routeId: null,
        rateTypeId: null,
        priceCurrency: "ZAR",
        requests: [
          {
            pickupAt: "2026-07-20T09:00:00+00:00",
            rentalDetails: { returnAt: "2026-07-22T09:00:00+00:00" },
          } as TransportLegState["requests"][number],
        ],
        bookingDate: null,
        confirmationDate: null,
        paymentMadeDate: null,
        paidWith: null,
        origin: "consultant",
      },
    ]

    expect(deriveTripDateRangeFromStates(detail, states)).toEqual({ start: "2026-07-16", end: "2026-07-22" })
  })

  it("skips deselected legs and undated services", () => {
    const detail = makeDetail([{ id: "train", routes: [{ id: "route-1", durationDays: 5 }] }, { id: "hotel" }])
    const states: ApplyLegState[] = [
      suiteState({ legId: "train", routeId: "route-1", serviceDate: "2026-07-01", selected: false }),
      suiteState({ legId: "hotel", supplierKind: "hotel_property", serviceDate: "2026-07-16", nights: 1 }),
    ]

    expect(deriveTripDateRangeFromStates(detail, states)).toEqual({ start: "2026-07-16", end: "2026-07-17" })
  })
})
