import { describe, expect, it } from "vitest"
import type { Database } from "@/lib/supabase/types"
import {
  mapLocation,
  mapSupplier,
  mapSupplierDetail,
  mapSupplierEmail,
  mapSupplierPackage,
  mapSupplierRateCard,
  mapSupplierRoute,
  mapSupplierSuiteType,
} from "@/lib/suppliers"

type LocationRow = Database["public"]["Tables"]["locations"]["Row"]
type PackageRow = Database["public"]["Tables"]["packages"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"]
type SupplierEmailRow = Database["public"]["Tables"]["supplier_emails"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]

const supplierRow: SupplierRow = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "blue-train",
  kind: "train_operator",
  status: "draft",
  name: "Blue Train",
  email: "ops@example.com",
  phone: "+27 12 345 6789",
  website: "example.com",
  location: "Cape Town",
  notes: "Preferred",
  active: false,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T11:30:00.000Z",
}

const packageRow: PackageRow = {
  id: "00000000-0000-4000-8000-000000000002",
  supplier_id: supplierRow.id,
  name: "Cape Explorer",
  description: null,
  duration_nights: 3,
  single_supplement_pct: 50,
  currency: "ZAR",
  active: true,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T10:00:00.000Z",
}

const routeRow: RouteRow = {
  id: "00000000-0000-4000-8000-000000000003",
  package_id: packageRow.id,
  name: "Cape Town - Pretoria",
  origin_location_id: "00000000-0000-4000-8000-000000000101",
  destination_location_id: "00000000-0000-4000-8000-000000000102",
  active: true,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T10:00:00.000Z",
}

const suiteTypeRow: SuiteTypeRow = {
  id: "00000000-0000-4000-8000-000000000004",
  supplier_id: supplierRow.id,
  name: "Suite Deluxe",
  active: true,
  created_at: "2026-01-01T10:00:00.000Z",
  updated_at: "2026-01-02T10:00:00.000Z",
}

const rateCardRow: RateCardRow = {
  id: "00000000-0000-4000-8000-000000000005",
  package_id: packageRow.id,
  route_id: routeRow.id,
  suite_type_id: suiteTypeRow.id,
  price_per_person: 15000,
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
      packageId: routeRow.package_id,
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

  it("maps supplier rate card with nullable route", () => {
    const result = mapSupplierRateCard({ ...rateCardRow, route_id: null })
    expect(result).toMatchObject({
      id: rateCardRow.id,
      packageId: rateCardRow.package_id,
      routeId: null,
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

describe("mapSupplierPackage", () => {
  it("maps package and nests routes/rate cards", () => {
    const result = mapSupplierPackage(packageRow, [routeRow], [rateCardRow])
    expect(result).toMatchObject({
      id: packageRow.id,
      supplierId: packageRow.supplier_id,
      name: packageRow.name,
      description: packageRow.description,
      durationNights: packageRow.duration_nights,
      singleSupplementPct: packageRow.single_supplement_pct,
      currency: packageRow.currency,
      active: packageRow.active,
    })
    expect(result.routes).toHaveLength(1)
    expect(result.rateCards).toHaveLength(1)
    expect(result.routes[0].id).toBe(routeRow.id)
    expect(result.rateCards[0].id).toBe(rateCardRow.id)
  })
})

describe("mapSupplierDetail", () => {
  it("assembles full nested detail payload", () => {
    const detail = mapSupplierDetail(
      supplierRow,
      [packageRow],
      [routeRow],
      [suiteTypeRow],
      [supplierEmailRow],
      [rateCardRow],
      [locationRow],
    )

    expect(detail.id).toBe(supplierRow.id)
    expect(detail.packages).toHaveLength(1)
    expect(detail.packages[0].routes).toHaveLength(1)
    expect(detail.packages[0].rateCards).toHaveLength(1)
    expect(detail.suiteTypes).toHaveLength(1)
    expect(detail.emails).toHaveLength(1)
    expect(detail.locations).toHaveLength(1)
    expect(detail.locations[0].id).toBe(locationRow.id)
  })
})
