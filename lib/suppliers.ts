import type { Database } from "@/lib/supabase/types"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import type {
  BookingScheduleSupplierKind,
  BookingSupplierSchedule,
  BookingVehicleRentalDetails,
  Location,
  Supplier,
  BookingTransportRequest,
  SupplierDetail,
  SupplierEmail,
  SupplierRateCard,
  SupplierRoute,
  SupplierSuiteType,
  TransportRequestServiceType,
  VehicleRentalRouteDetails,
} from "@/lib/types"

type BookingTransportRequestRow = Database["public"]["Tables"]["booking_transport_requests"]["Row"]
type BookingSupplierScheduleRow = Database["public"]["Tables"]["booking_supplier_schedules"]["Row"]
type BookingVehicleRentalDetailsRow = Database["public"]["Tables"]["booking_vehicle_rental_details"]["Row"]
type BookingTransportRequestWithRentalDetails = BookingTransportRequestRow & {
  rental_details?: BookingVehicleRentalDetailsRow | BookingVehicleRentalDetailsRow[] | null
}
type LocationRow = Database["public"]["Tables"]["locations"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"]
type SupplierEmailRow = Database["public"]["Tables"]["supplier_emails"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]
type VehicleRentalRouteDetailsRow = Database["public"]["Tables"]["vehicle_rental_route_details"]["Row"]

function normalizeSupplierStatus(value: string): Supplier["status"] {
  if (value === "draft" || value === "active" || value === "inactive") {
    return value
  }
  return "inactive"
}

function normalizeTransportRequestServiceType(value: string | null): TransportRequestServiceType | null {
  if (value === "transfer" || value === "rental") return value
  return null
}

function normalizeBookingScheduleSupplierKind(value: string): BookingScheduleSupplierKind | null {
  if (value === "hotel_property" || value === "train_operator") return value
  return null
}

function mapVehicleRentalRouteDetails(
  row: VehicleRentalRouteDetailsRow | null | undefined,
): VehicleRentalRouteDetails | null {
  if (!row) return null

  return {
    routeId: row.route_id,
    includedKmPerDay: row.included_km_per_day ?? null,
    extraKmPrice: row.extra_km_price ?? null,
    securityDeposit: row.security_deposit ?? null,
    oneWayFee: row.one_way_fee ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBookingVehicleRentalDetails(
  row: BookingVehicleRentalDetailsRow | BookingVehicleRentalDetailsRow[] | null | undefined,
): BookingVehicleRentalDetails | null {
  const details = Array.isArray(row) ? row[0] : row
  if (!details) return null

  return {
    transportRequestId: details.transport_request_id,
    returnAt: details.return_at ?? null,
    returnAtDisplay: formatDisplayDateTime(details.return_at),
    returnCutoffTime: details.return_cutoff_time ?? null,
    createdAt: details.created_at,
    updatedAt: details.updated_at,
  }
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
    locationDetail: row.location_detail ?? null,
    locationId: row.location_id ?? null,
    locationAreaId: row.location_area_id ?? null,
    description: row.description ?? null,
    notes: row.notes,
    active: row.active,
    singleSupplementPct: Number(row.single_supplement_pct ?? 0),
    defaultTimeStart: row.default_time_start ?? null,
    defaultTimeEnd: row.default_time_end ?? null,
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
    parentLocationId: row.parent_location_id ?? null,
    regionCode: row.region_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapSupplierRoute(
  row: RouteRow,
  vehicleRentalDetails?: VehicleRentalRouteDetailsRow | null,
): SupplierRoute {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    originLocationId: row.origin_location_id ?? null,
    destinationLocationId: row.destination_location_id ?? null,
    pickupPoint: row.pickup_point ?? null,
    dropoffPoint: row.dropoff_point ?? null,
    vehicleRentalDetails: mapVehicleRentalRouteDetails(vehicleRentalDetails),
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
    passengerCapacity: row.passenger_capacity ?? null,
    luggageCapacity: row.luggage_capacity ?? null,
    description: row.description ?? null,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapBookingTransportRequest(row: BookingTransportRequestWithRentalDetails): BookingTransportRequest {
  return {
    id: row.id,
    bookingId: row.booking_id,
    serviceType: normalizeTransportRequestServiceType(row.service_type) ?? "transfer",
    supplierId: row.supplier_id ?? null,
    routeId: row.route_id ?? null,
    suiteTypeId: row.suite_type_id ?? null,
    pickupPoint: row.pickup_point,
    dropoffPoint: row.dropoff_point,
    pickupAt: row.pickup_at ?? null,
    pickupAtDisplay: formatDisplayDateTime(row.pickup_at),
    rentalDetails: mapBookingVehicleRentalDetails(row.rental_details),
    passengerCount: row.passenger_count ?? null,
    luggageCount: row.luggage_count ?? null,
    flightNumber: row.flight_number ?? null,
    notes: row.notes ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export function mapBookingSupplierSchedule(row: BookingSupplierScheduleRow): BookingSupplierSchedule {
  return {
    id: row.id,
    bookingId: row.booking_id,
    supplierId: row.supplier_id ?? null,
    supplierKind: normalizeBookingScheduleSupplierKind(row.supplier_kind) ?? "train_operator",
    label: row.label ?? null,
    dateFrom: row.date_from ?? "",
    dateFromDisplay: formatDisplayDate(row.date_from),
    dateTo: row.date_to ?? "",
    dateToDisplay: formatDisplayDate(row.date_to),
    timeStart: row.time_start ?? null,
    timeEnd: row.time_end ?? null,
    notes: row.notes ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAt: row.updated_at,
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
  vehicleRentalRouteDetails: VehicleRentalRouteDetailsRow[] = [],
): SupplierDetail {
  const detailsByRouteId = new Map(
    vehicleRentalRouteDetails.map((details) => [details.route_id, details]),
  )

  return {
    ...mapSupplier(supplier),
    emails: emails.map(mapSupplierEmail),
    suiteTypes: suiteTypes.map(mapSupplierSuiteType),
    routes: routes.map((route) => mapSupplierRoute(route, detailsByRouteId.get(route.id))),
    rateCards: rateCards.map(mapSupplierRateCard),
    locations: locations.map(mapLocation),
  }
}
