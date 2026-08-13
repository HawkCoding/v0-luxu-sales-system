import { describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/types"
import {
  mapLocation,
  mapSupplier,
  mapSupplierDetail,
  mapSupplierEmail,
  mapSupplierRateCard,
  mapSupplierRoute,
  mapSupplierSuiteType,
} from "@/lib/suppliers"

type LocationRow = Database["public"]["Tables"]["locations"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"]
type SupplierEmailRow = Database["public"]["Tables"]["supplier_emails"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]

const supplierRow: SupplierRow = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "blue-train",
  kind: "train_operator",
  pricing_mode: "rate_card",
  base_rate_type_id: null,
  quote_rate_type_id: null,
  status: "draft",
  name: "Blue Train",
  description: null,
  email: "ops@example.com",
  phone: "+27 12 345 6789",
  website: "example.com",
  location_id: null,
  location_area_id: null,
  location: "Cape Town",
  location_detail: null,
  notes: "Preferred",
  active: false,
  single_supplement_pct: 35,
  default_time_start: null,
  default_time_end: null,
  inclusions: ["High Tea", "Wi-Fi"],
  exclusions: ["Gratuities"],
  street_address: null,
  emergency_phone: null,
  default_contact_name: null,
  infant_max_age: null,
  child_max_age: null,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T11:30:00.000Z",
}

const routeRow: RouteRow = {
  id: "00000000-0000-4000-8000-000000000003",
  supplier_id: supplierRow.id,
  name: "Cape Town - Pretoria",
  origin_location_id: "00000000-0000-4000-8000-000000000101",
  destination_location_id: "00000000-0000-4000-8000-000000000102",
  pickup_point: null,
  dropoff_point: null,
  active: true,
  direction_mode: "one_way",
  duration_days: null,
  departure_time: "08:30:00",
  arrival_time: "17:45:00",
  return_departure_time: null,
  return_arrival_time: null,
  suite_type_id: null,
  description: null,
  transport_service_type: null,
  included_km_per_day: null,
  extra_km_price: null,
  one_way_fee: null,
  security_deposit: null,
  default_excursions: [],
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T10:00:00.000Z",
}

const suiteTypeRow: SuiteTypeRow = {
  id: "00000000-0000-4000-8000-000000000004",
  supplier_id: supplierRow.id,
  name: "Suite Deluxe",
  passenger_capacity: null,
  luggage_capacity: null,
  description: null,
  sort_order: 0,
  active: true,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T10:00:00.000Z",
}

const rateCardRow: RateCardRow = {
  id: "00000000-0000-4000-8000-000000000005",
  route_id: routeRow.id,
  suite_type_id: suiteTypeRow.id,
  rate_type_id: "00000000-0000-4000-8000-0000000000ff",
  price_per_person: 15000,
  child_price: null,
  infant_price: null,
  currency: "ZAR",
  valid_from: "2026-01-01",
  valid_to: null,
  created_at: "2026-01-01T10:00:00.000Z",
}

const supplierEmailRow: SupplierEmailRow = {
  id: "00000000-0000-4000-8000-000000000006",
  supplier_id: supplierRow.id,
  email: "bookings@example.com",
  label: "Bookings",
  created_at: "2026-01-01T10:00:00.000Z",
}

const locationRow: LocationRow = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "Cape Town",
  country: "South Africa",
  region_code: "ZA-WC",
  parent_location_id: null,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-01T10:00:00.000Z",
}

describe("mapSupplier", () => {
  it("maps supplier row to camelCase fields", () => {
    const result = mapSupplier(supplierRow)
    expect(result).toMatchObject({
      id: supplierRow.id,
      slug: supplierRow.slug,
      kind: supplierRow.kind,
      status: supplierRow.status,
      name: supplierRow.name,
      email: supplierRow.email,
      phone: supplierRow.phone,
      website: supplierRow.website,
      location: supplierRow.location,
      notes: supplierRow.notes,
      active: supplierRow.active,
      singleSupplementPct: supplierRow.single_supplement_pct,
      createdAt: supplierRow.created_at,
      updatedAt: supplierRow.updated_at,
    })
    expect(result.createdAtDisplay).toBeTruthy()
    expect(result.updatedAtDisplay).toBeTruthy()
  })

  it("normalizes unknown status to inactive", () => {
    const result = mapSupplier({
      ...supplierRow,
      status: "unexpected_status_value",
    })
    expect(result.status).toBe("inactive")
  })
})

describe("individual row mappers", () => {
  it("maps location", () => {
    const result = mapLocation(locationRow)
    expect(result).toMatchObject({
      id: locationRow.id,
      name: locationRow.name,
      country: locationRow.country,
      regionCode: locationRow.region_code,
      createdAt: locationRow.created_at,
      updatedAt: locationRow.updated_at,
    })
  })

  it("maps supplier email", () => {
    const result = mapSupplierEmail(supplierEmailRow)
    expect(result).toMatchObject({
      id: supplierEmailRow.id,
      supplierId: supplierEmailRow.supplier_id,
      email: supplierEmailRow.email,
      label: supplierEmailRow.label,
      createdAt: supplierEmailRow.created_at,
    })
  })

  it("maps supplier route", () => {
    const result = mapSupplierRoute(routeRow)
    expect(result).toMatchObject({
      id: routeRow.id,
      supplierId: supplierRow.id,
      originLocationId: routeRow.origin_location_id,
      destinationLocationId: routeRow.destination_location_id,
      active: routeRow.active,
    })
  })

  it("maps supplier suite type", () => {
    const result = mapSupplierSuiteType(suiteTypeRow)
    expect(result).toMatchObject({
      id: suiteTypeRow.id,
      supplierId: suiteTypeRow.supplier_id,
      name: suiteTypeRow.name,
      active: suiteTypeRow.active,
    })
  })

  it("maps supplier rate card", () => {
    const result = mapSupplierRateCard(rateCardRow)
    expect(result).toMatchObject({
      id: rateCardRow.id,
      routeId: rateCardRow.route_id,
      suiteTypeId: rateCardRow.suite_type_id,
      pricePerPerson: rateCardRow.price_per_person,
      currency: rateCardRow.currency,
      validFrom: rateCardRow.valid_from,
      validTo: null,
    })
    expect(result.validFromDisplay).toBeTruthy()
    expect(result.createdAtDisplay).toBeTruthy()
  })
})

describe("mapSupplierDetail", () => {
  it("assembles full nested detail payload", () => {
    const detail = mapSupplierDetail(
      supplierRow,
      [suiteTypeRow],
      [supplierEmailRow],
      [routeRow],
      [rateCardRow],
      [locationRow],
    )

    expect(detail.id).toBe(supplierRow.id)
    expect(detail.suiteTypes).toHaveLength(1)
    expect(detail.emails).toHaveLength(1)
    expect(detail.routes).toHaveLength(1)
    expect(detail.rateCards).toHaveLength(1)
    expect(detail.locations).toHaveLength(1)
    expect(detail.locations[0].id).toBe(locationRow.id)
    expect(detail.stationAddresses).toEqual([])
  })

  it("maps station addresses and orders them by city name", () => {
    const pretoriaRow: LocationRow = {
      ...locationRow,
      id: "00000000-0000-4000-8000-000000000102",
      name: "Pretoria",
      region_code: "ZA-GP",
    }
    const detail = mapSupplierDetail(
      supplierRow,
      [suiteTypeRow],
      [supplierEmailRow],
      [routeRow],
      [rateCardRow],
      [locationRow, pretoriaRow],
      [],
      {
        stationAddresses: [
          {
            id: "00000000-0000-4000-8000-000000000201",
            supplier_id: supplierRow.id,
            location_id: pretoriaRow.id,
            station_name: "Rovos Rail Station",
            street_address: "Capital Park",
            notes: null,
            created_at: "2026-01-01T10:00:00.000Z",
            updated_at: "2026-01-01T10:00:00.000Z",
          },
          {
            id: "00000000-0000-4000-8000-000000000202",
            supplier_id: supplierRow.id,
            location_id: locationRow.id,
            station_name: "Cape Town Station",
            street_address: null,
            notes: "Platform 24",
            created_at: "2026-01-01T10:00:00.000Z",
            updated_at: "2026-01-01T10:00:00.000Z",
          },
        ],
      },
    )

    expect(detail.stationAddresses.map((station) => station.stationName)).toEqual([
      "Cape Town Station",
      "Rovos Rail Station",
    ])
    expect(detail.stationAddresses[0]).toMatchObject({
      locationId: locationRow.id,
      streetAddress: null,
      notes: "Platform 24",
    })
  })
})
