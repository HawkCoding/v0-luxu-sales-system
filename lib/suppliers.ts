import type { Database } from "@/lib/supabase/types"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import type {
  Location,
  Supplier,
  SupplierDetail,
  SupplierEmail,
  SupplierRateCard,
  SupplierRoute,
  SupplierSuiteType,
} from "@/lib/types"

type LocationRow = Database["public"]["Tables"]["locations"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"]
type SupplierEmailRow = Database["public"]["Tables"]["supplier_emails"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]

function normalizeSupplierStatus(value: string): Supplier["status"] {
  if (value === "draft" || value === "active" || value === "inactive") {
    return value
  }
  return "inactive"
}

export function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: normalizeSupplierStatus(row.status),
    name: row.name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    location: row.location,
    locationId: row.location_id ?? null,
    notes: row.notes,
    active: row.active,
    singleSupplementPct: Number(row.single_supplement_pct ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapLocation(row: LocationRow): Location {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    regionCode: row.region_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapSupplierRoute(row: RouteRow): SupplierRoute {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    originLocationId: row.origin_location_id,
    destinationLocationId: row.destination_location_id,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapSupplierSuiteType(row: SuiteTypeRow): SupplierSuiteType {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapSupplierRateCard(row: RateCardRow): SupplierRateCard {
  return {
    id: row.id,
    routeId: row.route_id,
    suiteTypeId: row.suite_type_id,
    pricePerPerson: row.price_per_person,
    childPrice: row.child_price,
    infantPrice: row.infant_price,
    currency: row.currency,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    createdAt: row.created_at,
    validFromDisplay: formatDisplayDate(row.valid_from),
    validToDisplay: formatDisplayDate(row.valid_to),
    createdAtDisplay: formatDisplayDateTime(row.created_at),
  }
}

export function mapSupplierEmail(row: SupplierEmailRow): SupplierEmail {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    email: row.email,
    label: row.label,
    createdAt: row.created_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
  }
}

export function mapSupplierDetail(
  supplier: SupplierRow,
  suiteTypes: SuiteTypeRow[],
  emails: SupplierEmailRow[],
  routes: RouteRow[] = [],
  rateCards: RateCardRow[] = [],
  locations: LocationRow[] = [],
): SupplierDetail {
  return {
    ...mapSupplier(supplier),
    emails: emails.map(mapSupplierEmail),
    suiteTypes: suiteTypes.map(mapSupplierSuiteType),
    routes: routes.map(mapSupplierRoute),
    rateCards: rateCards.map(mapSupplierRateCard),
    locations: locations.map(mapLocation),
  }
}
