import type { Database } from "@/lib/supabase/types"
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/date-format"
import { normalizeRouteDirectionMode } from "@/lib/routes/route-name"
import { toHoursMinutes } from "@/lib/routes/route-schedule"
import type {
  BookingScheduleSupplierKind,
  BookingSupplierSchedule,
  BookingVehicleRentalDetails,
  Location,
  Supplier,
  BookingTransportRequest,
  RateType,
  SupplierDetail,
  SupplierEmail,
  SupplierKind,
  SupplierRateAdjustment,
  SupplierRateCard,
  SupplierRoute,
  SupplierStationAddress,
  SupplierSuiteType,
  SupplierSuiteAlias,
  SupplierVariantValue,
  TransportRequestServiceType,
  VehicleRentalRouteDetails,
} from "@/lib/types"
import { resolveSupplierRateTiers } from "@/lib/rate-types/supplier-rate-tiers"

type BookingTransportRequestRow = Database["public"]["Tables"]["booking_transport_requests"]["Row"]
type BookingSupplierScheduleRow = Database["public"]["Tables"]["booking_supplier_schedules"]["Row"]
type BookingVehicleRentalDetailsRow = Database["public"]["Tables"]["booking_vehicle_rental_details"]["Row"]
type BookingTransportRequestWithRentalDetails = BookingTransportRequestRow & {
  rental_details?: BookingVehicleRentalDetailsRow | BookingVehicleRentalDetailsRow[] | null
}
type LocationRow = Database["public"]["Tables"]["locations"]["Row"]
type RateCardRow = Database["public"]["Tables"]["rate_cards"]["Row"]
type RouteRow = Database["public"]["Tables"]["routes"]["Row"]
/**
 * postgrest-js infers a narrower shape for `select("*")` than the generated Row -- it drops the
 * rate-type columns. Postgres still returns them at runtime, so accept them as optional rather
 * than widening every query.
 */
type SupplierRow = Omit<
  Database["public"]["Tables"]["suppliers"]["Row"],
  "base_rate_type_id" | "quote_rate_type_id"
> & {
  base_rate_type_id?: string | null
  quote_rate_type_id?: string | null
}
type SupplierEmailRow = Database["public"]["Tables"]["supplier_emails"]["Row"]
type SupplierStationAddressRow = Database["public"]["Tables"]["supplier_station_addresses"]["Row"]
type RateTypeRow = Database["public"]["Tables"]["rate_types"]["Row"]
type SupplierRateAdjustmentRow = Database["public"]["Tables"]["supplier_rate_adjustments"]["Row"]
type SuiteTypeRow = Database["public"]["Tables"]["suite_types"]["Row"]
type VehicleRentalRouteDetailsRow = Database["public"]["Tables"]["vehicle_rental_route_details"]["Row"]
type BedroomTypeRow = Database["public"]["Tables"]["bedroom_types"]["Row"]
type BedroomLayoutRow = Database["public"]["Tables"]["bedroom_layouts"]["Row"]
type BathroomTypeRow = Database["public"]["Tables"]["bathroom_types"]["Row"]
type SuiteTypeBedroomTypeRow = Database["public"]["Tables"]["suite_type_bedroom_types"]["Row"]
type SuiteTypeBedroomLayoutRow = Database["public"]["Tables"]["suite_type_bedroom_layouts"]["Row"]
type SuiteTypeBathroomTypeRow = Database["public"]["Tables"]["suite_type_bathroom_types"]["Row"]

function normalizeSupplierStatus(value: string): Supplier["status"] {
  if (value === "draft" || value === "active" || value === "inactive" || value === "temporary") {
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

export function buildSupplierSlugBase(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "supplier"
}

export function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    status: normalizeSupplierStatus(row.status),
    pricingMode: row.pricing_mode ?? "rate_card",
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
    infantMaxAge: row.infant_max_age ?? null,
    childMaxAge: row.child_max_age ?? null,
    defaultTimeStart: row.default_time_start ?? null,
    defaultTimeEnd: row.default_time_end ?? null,
    inclusions: row.inclusions ?? [],
    exclusions: row.exclusions ?? [],
    streetAddress: row.street_address ?? null,
    emergencyPhone: row.emergency_phone ?? null,
    defaultContactName: row.default_contact_name ?? null,
    parentSupplierId: row.parent_supplier_id ?? null,
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
  locationNameById?: Map<string, string>,
): SupplierRoute {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    originLocationId: row.origin_location_id ?? null,
    destinationLocationId: row.destination_location_id ?? null,
    originLocationName: row.origin_location_id
      ? locationNameById?.get(row.origin_location_id) ?? null
      : null,
    destinationLocationName: row.destination_location_id
      ? locationNameById?.get(row.destination_location_id) ?? null
      : null,
    pickupPoint: row.pickup_point ?? null,
    dropoffPoint: row.dropoff_point ?? null,
    vehicleRentalDetails: mapVehicleRentalRouteDetails(vehicleRentalDetails),
    directionMode: normalizeRouteDirectionMode(row.direction_mode),
    durationDays: row.duration_days ?? null,
    departureTime: toHoursMinutes(row.departure_time),
    arrivalTime: toHoursMinutes(row.arrival_time),
    returnDepartureTime: toHoursMinutes(row.return_departure_time),
    returnArrivalTime: toHoursMinutes(row.return_arrival_time),
    suiteTypeId: row.suite_type_id ?? null,
    description: row.description ?? null,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

export interface SuiteTypeMembershipMaps {
  bedroomTypeIdsBySuiteType: Map<string, string[]>
  bedroomLayoutIdsBySuiteType: Map<string, string[]>
  bathroomTypeIdsBySuiteType: Map<string, string[]>
  bedroomTypeNamesById: Map<string, string>
  bedroomLayoutNamesById: Map<string, string>
  bathroomTypeNamesById: Map<string, string>
}

export function mapSupplierSuiteType(
  row: SuiteTypeRow,
  memberships?: SuiteTypeMembershipMaps,
): SupplierSuiteType {
  const bedroomTypeIds = memberships?.bedroomTypeIdsBySuiteType.get(row.id) ?? []
  const bedroomLayoutIds = memberships?.bedroomLayoutIdsBySuiteType.get(row.id) ?? []
  const bathroomTypeIds = memberships?.bathroomTypeIdsBySuiteType.get(row.id) ?? []

  const bedroomTypes = memberships
    ? bedroomTypeIds
        .map((id) => memberships.bedroomTypeNamesById.get(id))
        .filter((name): name is string => Boolean(name))
    : undefined
  const bedroomLayouts = memberships
    ? bedroomLayoutIds
        .map((id) => memberships.bedroomLayoutNamesById.get(id))
        .filter((name): name is string => Boolean(name))
    : undefined
  const bathroomTypes = memberships
    ? bathroomTypeIds
        .map((id) => memberships.bathroomTypeNamesById.get(id))
        .filter((name): name is string => Boolean(name))
    : undefined

  return {
    id: row.id,
    supplierId: row.supplier_id,
    name: row.name,
    passengerCapacity: row.passenger_capacity ?? null,
    luggageCapacity: row.luggage_capacity ?? null,
    description: row.description ?? null,
    active: row.active,
    sortOrder: row.sort_order ?? 0,
    bedroomTypeIds,
    bedroomLayoutIds,
    bathroomTypeIds,
    bedroomTypes,
    bedroomLayouts,
    bathroomTypes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdAtDisplay: formatDisplayDateTime(row.created_at),
    updatedAtDisplay: formatDisplayDateTime(row.updated_at),
  }
}

function mapVariantValue(row: {
  id: string
  name: string
  sort_order: number
  archived_at: string | null
}): SupplierVariantValue {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order ?? 0,
    archivedAt: row.archived_at ?? null,
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
    serviceId: row.service_id ?? null,
    pickupPoint: row.pickup_point,
    dropoffPoint: row.dropoff_point,
    pickupAt: row.pickup_at ?? null,
    pickupAtDisplay: formatDisplayDateTime(row.pickup_at),
    rentalDetails: mapBookingVehicleRentalDetails(row.rental_details),
    passengerCount: row.passenger_count ?? null,
    luggageCount: row.luggage_count ?? null,
    flightNumber: row.flight_number ?? null,
    priceOverride: row.price_override ?? null,
    priceOverrideSetAt: row.price_override_set_at ?? null,
    notes: row.notes ?? null,
    supplierReference: row.supplier_reference ?? null,
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
    bookingDate: row.booking_date ?? null,
    bookingDateDisplay: formatDisplayDate(row.booking_date),
    confirmationDate: row.confirmation_date ?? null,
    confirmationDateDisplay: formatDisplayDate(row.confirmation_date),
    paymentMadeDate: row.payment_made_date ?? null,
    paymentMadeDateDisplay: formatDisplayDate(row.payment_made_date),
    paidWith: row.paid_with ?? null,
    amountPayable: row.amount_payable ?? null,
    amountReceivable: row.amount_receivable ?? null,
  }
}

export function mapSupplierRateCard(row: RateCardRow): SupplierRateCard {
  return {
    id: row.id,
    routeId: row.route_id,
    suiteTypeId: row.suite_type_id,
    rateTypeId: row.rate_type_id,
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

export function mapRateType(row: RateTypeRow): RateType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sortOrder: row.sort_order ?? 0,
    isDefault: row.is_default,
    isStandard: row.is_standard ?? false,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export function mapSupplierStationAddress(row: SupplierStationAddressRow): SupplierStationAddress {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    locationId: row.location_id,
    stationName: row.station_name ?? null,
    streetAddress: row.street_address ?? null,
    notes: row.notes ?? null,
  }
}

export interface SupplierDetailMapInput {
  bedroomTypes?: BedroomTypeRow[]
  bedroomLayouts?: BedroomLayoutRow[]
  bathroomTypes?: BathroomTypeRow[]
  suiteTypeBedroomTypes?: SuiteTypeBedroomTypeRow[]
  suiteTypeBedroomLayouts?: SuiteTypeBedroomLayoutRow[]
  suiteTypeBathroomTypes?: SuiteTypeBathroomTypeRow[]
  rateTypes?: RateTypeRow[]
  rateAdjustments?: SupplierRateAdjustmentRow[]
  suiteAliases?: SuiteVocabAliasRow[]
  stationAddresses?: SupplierStationAddressRow[]
  /** The sibling record this supplier inherits its contacts from, when parent_supplier_id is set. */
  parentSupplier?: { name: string; kind: SupplierKind; slug: string } | null
}

type SuiteVocabAliasRow = {
  axis: string
  phrase: string
  status: string
  suite_type_id: string | null
  bedroom_type_id: string | null
  bedroom_layout_id: string | null
  bathroom_type_id: string | null
}

const SUITE_ALIAS_AXIS_BY_DB_VALUE: Record<string, SupplierSuiteAlias["axis"]> = {
  suite_type: "suiteType",
  bedroom_type: "bedroomType",
  bedroom_layout: "bedroomLayout",
  bathroom_type: "bathroomType",
}

function mapSuiteAlias(row: SuiteVocabAliasRow): SupplierSuiteAlias | null {
  const axis = SUITE_ALIAS_AXIS_BY_DB_VALUE[row.axis]
  const targetId =
    row.suite_type_id ?? row.bedroom_type_id ?? row.bedroom_layout_id ?? row.bathroom_type_id ?? null
  if (!axis || !targetId) return null

  return {
    axis,
    phrase: row.phrase,
    targetId,
    status: row.status === "confirmed" ? "confirmed" : "provisional",
  }
}

function buildSuiteTypeMemberships(
  bedroomTypeRows: BedroomTypeRow[],
  bedroomLayoutRows: BedroomLayoutRow[],
  bathroomTypeRows: BathroomTypeRow[],
  suiteTypeBedroomTypes: SuiteTypeBedroomTypeRow[],
  suiteTypeBedroomLayouts: SuiteTypeBedroomLayoutRow[],
  suiteTypeBathroomTypes: SuiteTypeBathroomTypeRow[],
): SuiteTypeMembershipMaps {
  const bedroomTypeIdsBySuiteType = new Map<string, string[]>()
  for (const row of suiteTypeBedroomTypes) {
    const list = bedroomTypeIdsBySuiteType.get(row.suite_type_id) ?? []
    list.push(row.bedroom_type_id)
    bedroomTypeIdsBySuiteType.set(row.suite_type_id, list)
  }
  const bedroomLayoutIdsBySuiteType = new Map<string, string[]>()
  for (const row of suiteTypeBedroomLayouts) {
    const list = bedroomLayoutIdsBySuiteType.get(row.suite_type_id) ?? []
    list.push(row.bedroom_layout_id)
    bedroomLayoutIdsBySuiteType.set(row.suite_type_id, list)
  }
  const bathroomTypeIdsBySuiteType = new Map<string, string[]>()
  for (const row of suiteTypeBathroomTypes) {
    const list = bathroomTypeIdsBySuiteType.get(row.suite_type_id) ?? []
    list.push(row.bathroom_type_id)
    bathroomTypeIdsBySuiteType.set(row.suite_type_id, list)
  }
  const bedroomTypeNamesById = new Map(bedroomTypeRows.map((row) => [row.id, row.name]))
  const bedroomLayoutNamesById = new Map(bedroomLayoutRows.map((row) => [row.id, row.name]))
  const bathroomTypeNamesById = new Map(bathroomTypeRows.map((row) => [row.id, row.name]))
  return {
    bedroomTypeIdsBySuiteType,
    bedroomLayoutIdsBySuiteType,
    bathroomTypeIdsBySuiteType,
    bedroomTypeNamesById,
    bedroomLayoutNamesById,
    bathroomTypeNamesById,
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
  variants: SupplierDetailMapInput = {},
): SupplierDetail {
  const detailsByRouteId = new Map(
    vehicleRentalRouteDetails.map((details) => [details.route_id, details]),
  )

  const bedroomTypeRows = variants.bedroomTypes ?? []
  const bedroomLayoutRows = variants.bedroomLayouts ?? []
  const bathroomTypeRows = variants.bathroomTypes ?? []
  const memberships = buildSuiteTypeMemberships(
    bedroomTypeRows,
    bedroomLayoutRows,
    bathroomTypeRows,
    variants.suiteTypeBedroomTypes ?? [],
    variants.suiteTypeBedroomLayouts ?? [],
    variants.suiteTypeBathroomTypes ?? [],
  )

  const sortedSuiteTypes = [...suiteTypes].sort((a, b) => {
    const aOrder = a.sort_order ?? 0
    const bOrder = b.sort_order ?? 0
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name)
  })

  const rateTypes = [...(variants.rateTypes ?? [])]
    .filter((row) => !row.archived_at)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
    .map(mapRateType)

  const locationNameById = new Map(locations.map((location) => [location.id, location.name]))

  const mapped = mapSupplier(supplier)
  const rateTiers = resolveSupplierRateTiers(rateTypes, {
    baseRateTypeId: supplier.base_rate_type_id ?? null,
    quoteRateTypeId: supplier.quote_rate_type_id ?? null,
  })

  return {
    ...mapped,
    parentSupplierName: variants.parentSupplier?.name ?? null,
    parentSupplierKind: variants.parentSupplier?.kind ?? null,
    parentSupplierSlug: variants.parentSupplier?.slug ?? null,
    emails: emails.map(mapSupplierEmail),
    suiteTypes: sortedSuiteTypes.map((row) => mapSupplierSuiteType(row, memberships)),
    routes: routes.map((route) =>
      mapSupplierRoute(route, detailsByRouteId.get(route.id), locationNameById),
    ),
    rateCards: rateCards.map(mapSupplierRateCard),
    // Sorted by city name so the editor lists stations in a stable, readable order.
    stationAddresses: [...(variants.stationAddresses ?? [])]
      .sort((a, b) =>
        (locationNameById.get(a.location_id) ?? "").localeCompare(locationNameById.get(b.location_id) ?? ""),
      )
      .map(mapSupplierStationAddress),
    locations: locations.map(mapLocation),
    bedroomTypes: [...bedroomTypeRows]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(mapVariantValue),
    bedroomLayouts: [...bedroomLayoutRows]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(mapVariantValue),
    bathroomTypes: [...bathroomTypeRows]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
      .map(mapVariantValue),
    suiteAliases: (variants.suiteAliases ?? [])
      .map(mapSuiteAlias)
      .filter((alias): alias is SupplierSuiteAlias => alias !== null),
    rateTypes: rateTypes,
    rateAdjustments: (variants.rateAdjustments ?? []).map((row) => ({
      rateTypeId: row.rate_type_id,
      discountPct: Number(row.discount_pct ?? 0),
    })),
    baseRateTypeId: rateTiers.baseRateTypeId,
    quoteRateTypeId: rateTiers.quoteRateTypeId,
  }
}
