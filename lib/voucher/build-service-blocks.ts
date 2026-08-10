import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  VoucherServiceBlock,
  VoucherServiceBlockContact,
  VoucherServiceBlockData,
  VoucherServiceType,
} from "@/lib/generate-voucher"
import { voucherServiceTypeLabel } from "@/lib/generate-voucher"
import { addDays, trainArrivalDate } from "@/lib/packages/hotel-dates"
import { getHotelDefaultTimes, type HotelDefaultTimes } from "@/lib/suppliers/hotel-default-times"
import type { Database } from "@/lib/supabase/types"
import type { SupplierKind } from "@/lib/types"
import { resolveDirectedArrivalName, resolveDirectedRouteName } from "@/lib/routes/route-name"
import { firstRecord } from "@/lib/utils"

export function mapSupplierKindToServiceType(kind: SupplierKind | string | null): VoucherServiceType {
  switch (kind) {
    case "train_operator":
      return "train"
    case "hotel_property":
      return "hotel"
    case "transfers":
    case "vehicle_rental":
      return "transfer"
    case "tour_operator":
      return "tour"
    case "airline":
      return "airline"
    default:
      return "additional_service"
  }
}

interface BuildContext {
  bookingId: string
  additionalServicesDetails?: string | null
  /** Fallback check-in/check-out times when a hotel has no default times of its own. */
  hotelDefaultTimes?: HotelDefaultTimes
  /** When set, restricts package-leg selections (and their leg-scoped transport requests) to
   * these leg ids — scopes a specific quote version's itinerary to what was actually priced into
   * it, instead of whatever is currently selected live on the job. Manually-added transport
   * requests (no package leg) are never priced this way and stay unfiltered. */
  legIds?: Set<string>
  /** Transport requests tied to neither a package leg nor a booking service are never priced
   * into a quote (see `findTransportRequestsForLeg` in lib/quotes/build-from-package.ts), so on
   * a surface scoped to the accepted quote they would be the one thing `legIds` cannot filter.
   * Voucher and itinerary pass false; quote surfaces leave the default so their behavior is
   * unchanged. */
  includeUnlinkedTransportRequests?: boolean
  /** The booking's reservation-details form — folded into every train/hotel block as a
   * "Requests" and "Occasion" row, mirroring how the legacy voucher repeated the party's meal
   * seating, smoking preference and occasion on each service block. */
  reservationDetails?: {
    occasion: string | null
    mealSeating: "first" | "second" | null
    smokingPreference: "smoking" | "non_smoking" | null
  } | null
  /** Full names of the party's travellers, in booking order — printed on every flight block as
   * "1.1 Name  1.2 Name", matching the legacy voucher's FlySafair passenger table. Every flight on
   * a booking carries the whole party, since a captured transport request has no notion of which
   * travellers are actually on which flight. */
  travellerNames?: string[]
}

/** A train supplier's boarding/alighting address in one city — see `resolveStationPoints`. */
interface StationAddressJoin {
  location_id: string | null
  station_name: string | null
  street_address: string | null
}

interface SupplierJoin {
  name: string | null
  phone: string | null
  email: string | null
  website: string | null
  location: string | null
  description: string | null
  street_address: string | null
  emergency_phone: string | null
  default_contact_name: string | null
  kind: SupplierKind | string | null
  default_time_start: string | null
  default_time_end: string | null
  inclusions: string[] | null
  exclusions: string[] | null
  station_addresses: StationAddressJoin[] | null
}

interface RouteJoin {
  name: string | null
  duration_days: number | null
  direction_mode: string | null
  default_excursions: string[] | null
  origin: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null
  destination: { id: string | null; name: string | null } | { id: string | null; name: string | null }[] | null
}

interface FlightDetailsJoin {
  cabin: string | null
  departure_airport_code: string | null
  arrival_airport_code: string | null
  arrival_at: string | null
  hand_luggage_kg: number | null
  checked_luggage_kg: number | null
  priority_boarding: boolean | null
}

interface TransportRequestJoinRow {
  id: string
  package_leg_id: string | null
  /** Set instead of package_leg_id for a Build Booking (booking_services) leg. */
  service_id: string | null
  supplier_id: string | null
  service_type: string
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  flight_number: string | null
  passenger_count: number | null
  notes: string | null
  sort_order: number
  supplier_reference: string | null
  supplier_contact_name: string | null
  voucher_footnote: string | null
  suppliers: SupplierJoin | SupplierJoin[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  rental_details:
    | { return_at: string | null }
    | { return_at: string | null }[]
    | null
  flight_details: FlightDetailsJoin | FlightDetailsJoin[] | null
}

interface SelectionUnitJoinRow {
  suite_type_id: string | null
  sort_order: number
  adult_count: number | null
  child_count: number | null
  infant_count: number | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  bedroom_types: { name: string | null } | { name: string | null }[] | null
  bedroom_layouts: { name: string | null } | { name: string | null }[] | null
  bathroom_types: { name: string | null } | { name: string | null }[] | null
}

interface SelectionJoinRow {
  id: string
  package_leg_id: string
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  route_reversed: boolean | null
  suite_type_id: string | null
  service_date: string | null
  nights: number | null
  notes: string | null
  supplier_reference: string | null
  supplier_contact_name: string | null
  voucher_footnote: string | null
  excursions: string[] | null
  package_legs: { sort_order: number; label: string | null } | { sort_order: number; label: string | null }[] | null
  suppliers: SupplierJoin | SupplierJoin[] | null
  routes: RouteJoin | RouteJoin[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  /** Per-suite/room unit rows (train & hotel legs only). Suite type moved here — the
   * leg-level suite_type_id/suite_types join is now a legacy fallback for pre-cutover rows. */
  units: SelectionUnitJoinRow[] | null
}

interface BookingServiceJoinRow {
  id: string
  label: string | null
  sort_order: number
  selected: boolean
  supplier_id: string | null
  route_id: string | null
  route_reversed: boolean | null
  suite_type_id: string | null
  service_date: string | null
  nights: number | null
  notes: string | null
  supplier_reference: string | null
  supplier_contact_name: string | null
  voucher_footnote: string | null
  excursions: string[] | null
  suppliers: SupplierJoin | SupplierJoin[] | null
  routes: RouteJoin | RouteJoin[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  units: SelectionUnitJoinRow[] | null
}

/** Reshapes a Build Booking (booking_services) row into the same SelectionJoinRow shape a
 * catalogue-package selection has, so every rule below this point (dates, times, suite labels,
 * transport-request matching) runs once, unaware of which table a booking actually used. The
 * service row IS the leg (no separate package_legs indirection), so its own id doubles as
 * package_leg_id -- transport-request matching and quote-version leg scoping both key off this
 * same field regardless of which table produced the row. */
function serviceRowToSelectionRow(row: BookingServiceJoinRow): SelectionJoinRow {
  return {
    id: row.id,
    package_leg_id: row.id,
    selected: row.selected,
    supplier_id: row.supplier_id,
    route_id: row.route_id,
    route_reversed: row.route_reversed,
    suite_type_id: row.suite_type_id,
    service_date: row.service_date,
    nights: row.nights,
    notes: row.notes,
    supplier_reference: row.supplier_reference,
    supplier_contact_name: row.supplier_contact_name,
    voucher_footnote: row.voucher_footnote,
    excursions: row.excursions,
    package_legs: { sort_order: row.sort_order, label: row.label },
    suppliers: row.suppliers,
    routes: row.routes,
    suite_types: row.suite_types,
    units: row.units,
  }
}

export interface BuildVoucherServiceBlocksResult {
  blocks: VoucherServiceBlock[]
}

/** Postgres `time` comes back as HH:MM:SS; the documents only ever show HH:MM. */
function toHoursMinutes(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 5)
}

/** YYYY-MM-DD part of a pickup timestamp. */
function timestampDate(value: string | null | undefined): string | null {
  if (!value) return null
  const candidate = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null
}

/** HH:MM part of a pickup timestamp, in the timezone it was entered (same convention as
 * `formatDisplayDateTime` on the booking screens). */
function timestampTime(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}

function cleanList(values: string[] | null | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean)
}

/** "Twin bedded Deluxe Suite with a shower" — a unit's suite type, prefixed with its bed
 * configuration and suffixed with its bathroom, when the unit has those selected. Either can be
 * absent (legacy rows, or a supplier that doesn't track that variant), in which case that part is
 * simply omitted rather than leaving an awkward gap. */
function composeUnitSuiteLabel(
  suiteTypeName: string | null | undefined,
  bedConfigName: string | null | undefined,
  bathroomTypeName: string | null | undefined,
): string | null {
  const suite = suiteTypeName?.trim()
  if (!suite) return null
  const bedPrefix = bedConfigName?.trim() ? `${bedConfigName.trim()} bedded ` : ""
  const bathroomSuffix = bathroomTypeName?.trim() ? ` with a ${bathroomTypeName.trim().toLowerCase()}` : ""
  return `${bedPrefix}${suite}${bathroomSuffix}`
}

/** Suite/room labels selected for a leg, in unit order, de-duplicated. Falls back to the legacy
 * leg-level suite_types join for selections captured before the per-unit cutover (migration
 * 20260701050000_booking_package_selection_units) — those rows have no unit children and no
 * bedroom/bathroom configuration to compose in.
 *
 * `includeConfig` composes each unit's bed/bathroom configuration into its label (train legs, so
 * the itinerary line reads "Twin bedded Deluxe Suite with a shower"); hotel legs pass false since
 * their room name alone already fills that role in the sentence. */
function resolveLegSuiteNames(
  row: SelectionJoinRow,
  includeConfig: boolean,
): { names: string[]; unitCount: number } {
  const unitRows = [...(row.units ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const unitLabels = unitRows
    .map((unit) =>
      includeConfig
        ? composeUnitSuiteLabel(
            firstRecord(unit.suite_types)?.name,
            firstRecord(unit.bedroom_layouts)?.name ?? firstRecord(unit.bedroom_types)?.name,
            firstRecord(unit.bathroom_types)?.name,
          )
        : firstRecord(unit.suite_types)?.name?.trim() || null,
    )
    .filter((label): label is string => Boolean(label))
  if (unitRows.length > 0) {
    return { names: Array.from(new Set(unitLabels)), unitCount: unitRows.length }
  }
  const legacyName = firstRecord(row.suite_types)?.name?.trim()
  return { names: legacyName ? [legacyName] : [], unitCount: legacyName ? 1 : 0 }
}

/** Adults/children/infants captured across a leg's suite/room units — null when the leg has no
 * units (legacy pre-cutover rows), so the voucher omits the row rather than printing zeroes. */
function sumUnitGuestBreakdown(
  units: SelectionUnitJoinRow[] | null,
): { adults: number; children: number; infants: number } | null {
  if (!units || units.length === 0) return null
  return units.reduce(
    (total, unit) => ({
      adults: total.adults + (unit.adult_count ?? 0),
      children: total.children + (unit.child_count ?? 0),
      infants: total.infants + (unit.infant_count ?? 0),
    }),
    { adults: 0, children: 0, infants: 0 },
  )
}

/** "1st seating meals; Nonsmoking" — the reservation form's meal-seating and smoking preference
 * folded into one line, the way the legacy voucher printed them on the train block. */
function buildRequestsLine(details: BuildContext["reservationDetails"]): string | null {
  if (!details) return null
  const parts: string[] = []
  if (details.mealSeating) {
    parts.push(details.mealSeating === "first" ? "1st seating meals" : "2nd seating meals")
  }
  if (details.smokingPreference) {
    parts.push(details.smokingPreference === "smoking" ? "Smoking" : "Nonsmoking")
  }
  return parts.length > 0 ? parts.join("; ") : null
}

/** The route name as it should read on client documents: the canonical name, unless it's a
 * two-way route with resolvable endpoint names, in which case it renders the booked direction. */
function resolveVoucherRouteName(route: RouteJoin | null | undefined, reversed: boolean): string | null {
  if (!route) return null
  const origin = firstRecord(route.origin)?.name
  const destination = firstRecord(route.destination)?.name
  if (route.direction_mode !== "round_trip" || !origin || !destination) return route.name
  return resolveDirectedRouteName(origin, destination, reversed)
}

/** The station a train leg arrives at, honoring `route_reversed` — null when the route's
 * endpoints aren't resolvable (falls back to no station shown, never the supplier's static
 * location). */
function resolveVoucherArrivalStation(route: RouteJoin | null | undefined, reversed: boolean): string | null {
  if (!route) return null
  const origin = firstRecord(route.origin)?.name
  const destination = firstRecord(route.destination)?.name
  if (!origin || !destination) return null
  return resolveDirectedArrivalName(origin, destination, reversed)
}

/** "Rovos Rail Station, Capital Park, Pretoria" — a station row rendered as one address line.
 * Null when the row carries neither a name nor an address. */
function formatStationAddress(station: StationAddressJoin | undefined): string | null {
  if (!station) return null
  const parts = [station.station_name?.trim(), station.street_address?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(", ") : null
}

/**
 * Where a train leg boards and where it alights, as street addresses. A train supplier serves a
 * different station in every city, so these come from its per-city `supplier_station_addresses`
 * rows keyed on the route's own endpoints — never from the supplier's `street_address`, which is
 * its head office and knows nothing of city or direction.
 *
 * `reversed` swaps origin and destination exactly as `resolveVoucherArrivalStation` does, so the
 * printed arrival station and the printed arrival address can never disagree.
 */
function resolveStationPoints(
  supplier: SupplierJoin | null | undefined,
  route: RouteJoin | null | undefined,
  reversed: boolean,
): { boarding: string | null; arrival: string | null } {
  const stations = supplier?.station_addresses ?? []
  if (stations.length === 0 || !route) return { boarding: null, arrival: null }

  const originId = firstRecord(route.origin)?.id
  const destinationId = firstRecord(route.destination)?.id
  const boardingId = reversed ? destinationId : originId
  const arrivalId = reversed ? originId : destinationId

  const byLocationId = new Map(
    stations.flatMap((station) => (station.location_id ? [[station.location_id, station] as const] : [])),
  )
  return {
    boarding: formatStationAddress(boardingId ? byLocationId.get(boardingId) : undefined),
    arrival: formatStationAddress(arrivalId ? byLocationId.get(arrivalId) : undefined),
  }
}

interface TransportBlockContext {
  title: string
  displayOrder: number
  contactDetails: VoucherServiceBlockContact
  supplier: SupplierJoin | null | undefined
  /** Leg-level vehicle category, used when the request doesn't set its own. */
  fallbackVehicle: string | null
  supplierReference: string | null
  /** See `BuildContext.travellerNames` — only read for flight requests. */
  travellerNames: string[] | null
}

/** One captured transfer/rental/flight trip → one client-facing block. Flights reuse this same
 * request row (pickup/dropoff double as departure/arrival airports, pickup_at as the departure
 * time, supplier_reference as the PNR) so a flight gets its own "airline" block instead of a
 * "transfer" one; everything else here is the typed pickup/drop-off and pickup time being
 * authoritative, with rentals additionally carrying their return date/time. */
function transportRequestBlock(
  request: TransportRequestJoinRow,
  blockContext: TransportBlockContext,
): VoucherServiceBlock {
  const requestSuite = firstRecord(request.suite_types)
  const rental = firstRecord(request.rental_details)
  const isRental = request.service_type === "rental"
  const isFlight = request.service_type === "flight"
  const flight = isFlight ? firstRecord(request.flight_details) : null

  const contactDetails: VoucherServiceBlockContact = {
    ...blockContext.contactDetails,
    streetAddress: blockContext.supplier?.street_address ?? blockContext.contactDetails.streetAddress ?? null,
    emergencyPhone: blockContext.supplier?.emergency_phone ?? blockContext.contactDetails.emergencyPhone ?? null,
  }
  const supplierContactName = request.supplier_contact_name ?? blockContext.supplier?.default_contact_name ?? null

  if (isFlight) {
    return {
      serviceType: "airline",
      title: blockContext.title,
      supplierId: request.supplier_id,
      supplierReference: blockContext.supplierReference,
      supplierContactName,
      contactDetails,
      serviceData: {
        route:
          request.pickup_point.trim() && request.dropoff_point.trim()
            ? `${request.pickup_point.trim()} → ${request.dropoff_point.trim()}`
            : null,
        departureAirportCode: request.pickup_point.trim() || null,
        arrivalAirportCode: request.dropoff_point.trim() || null,
        departureDate: timestampDate(request.pickup_at),
        startTime: timestampTime(request.pickup_at),
        arrivalDate: timestampDate(flight?.arrival_at),
        endTime: timestampTime(flight?.arrival_at),
        cabin: flight?.cabin ?? null,
        flightNumber: request.flight_number,
        passengerCount: request.passenger_count,
        handLuggageKg: flight?.hand_luggage_kg ?? null,
        checkedLuggageKg: flight?.checked_luggage_kg ?? null,
        priorityBoarding: flight?.priority_boarding ?? null,
        passengerNames: blockContext.travellerNames?.length ? blockContext.travellerNames : undefined,
        notes: request.notes,
        footnote: request.voucher_footnote,
      },
      displayOrder: blockContext.displayOrder,
    }
  }

  return {
    serviceType: "transfer",
    title: blockContext.title,
    supplierId: request.supplier_id,
    supplierReference: blockContext.supplierReference,
    supplierContactName,
    contactDetails,
    serviceData: {
      pickup: request.pickup_point.trim() || null,
      dropoff: request.dropoff_point.trim() || null,
      departureDate: timestampDate(request.pickup_at),
      startTime:
        timestampTime(request.pickup_at) ?? toHoursMinutes(blockContext.supplier?.default_time_start),
      arrivalDate: isRental ? timestampDate(rental?.return_at) : null,
      endTime: isRental ? timestampTime(rental?.return_at) : null,
      vehicleType: requestSuite?.name ?? blockContext.fallbackVehicle,
      suiteType: requestSuite?.name ?? blockContext.fallbackVehicle,
      flightNumber: request.flight_number,
      passengerCount: request.passenger_count,
      notes: request.notes,
      footnote: request.voucher_footnote,
      inclusions: cleanList(blockContext.supplier?.inclusions),
      exclusions: cleanList(blockContext.supplier?.exclusions),
    },
    displayOrder: blockContext.displayOrder,
  }
}

/**
 * Every itinerary surface — quote PDF, quote email, itinerary PDF, voucher — renders from these
 * blocks, so this is the one place a leg's dates, times and client-facing bullets get resolved.
 *
 * Dates: a hotel's service_date is its check-in, so check-out is check-in + nights. Everything else
 * runs for its route's duration_days, which counts the departure day itself.
 *
 * Times: a supplier's own default times win; hotels fall back to the app-wide check-in/check-out
 * settings so a stay always states a time.
 */
export async function buildVoucherServiceBlocks(
  supabase: SupabaseClient<Database>,
  context: BuildContext,
): Promise<BuildVoucherServiceBlocksResult> {
  const { data: rows, error } = await supabase
    .from("booking_package_selections")
    .select(
      `id, package_leg_id, selected, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, notes, supplier_reference, supplier_contact_name, voucher_footnote, excursions,
       package_legs(sort_order, label),
       suppliers(name, phone, email, website, location, description, street_address, emergency_phone, default_contact_name, kind, default_time_start, default_time_end, inclusions, exclusions, station_addresses:supplier_station_addresses(location_id, station_name, street_address)),
       routes(name, duration_days, direction_mode, default_excursions, origin:locations!routes_origin_location_id_fkey(id, name), destination:locations!routes_destination_location_id_fkey(id, name)),
       suite_types(name),
       units:booking_package_selection_units(suite_type_id, sort_order, adult_count, child_count, infant_count, suite_types(name), bedroom_types(name), bedroom_layouts(name), bathroom_types(name))`,
    )
    .eq("booking_id", context.bookingId)

  if (error) throw error

  // Build Booking's per-booking equivalent of the query above -- a booking uses one or the
  // other, never both. Reshaped to the same row shape immediately below so nothing downstream
  // needs to know which table it came from.
  const { data: serviceRows, error: servicesError } = await supabase
    .from("booking_services")
    .select(
      `id, label, sort_order, selected, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, notes, supplier_reference, supplier_contact_name, voucher_footnote, excursions,
       suppliers(name, phone, email, website, location, description, street_address, emergency_phone, default_contact_name, kind, default_time_start, default_time_end, inclusions, exclusions, station_addresses:supplier_station_addresses(location_id, station_name, street_address)),
       routes(name, duration_days, direction_mode, default_excursions, origin:locations!routes_origin_location_id_fkey(id, name), destination:locations!routes_destination_location_id_fkey(id, name)),
       suite_types(name),
       units:booking_service_units(suite_type_id, sort_order, adult_count, child_count, infant_count, suite_types(name), bedroom_types(name), bedroom_layouts(name), bathroom_types(name))`,
    )
    .eq("booking_id", context.bookingId)

  if (servicesError) throw servicesError

  // Transfers/rentals render from what the salesperson actually captured per trip — the typed
  // pickup/drop-off, pickup time and flight — never from a route's static points.
  const { data: transportRows, error: transportError } = await supabase
    .from("booking_transport_requests")
    .select(
      `id, package_leg_id, service_id, supplier_id, service_type, pickup_point, dropoff_point, pickup_at, flight_number, passenger_count, notes, sort_order, supplier_reference, supplier_contact_name, voucher_footnote,
       suppliers(name, phone, email, website, location, description, street_address, emergency_phone, default_contact_name, kind, default_time_start, default_time_end, inclusions, exclusions, station_addresses:supplier_station_addresses(location_id, station_name, street_address)),
       suite_types(name),
       rental_details:booking_vehicle_rental_details(return_at),
       flight_details:booking_flight_details(cabin, departure_airport_code, arrival_airport_code, arrival_at, hand_luggage_kg, checked_luggage_kg, priority_boarding)`,
    )
    .eq("booking_id", context.bookingId)
    .order("sort_order", { ascending: true })

  if (transportError) throw transportError
  const transportRequests = (transportRows ?? []) as unknown as TransportRequestJoinRow[]

  const packageSelectionRows = (rows ?? []) as unknown as SelectionJoinRow[]
  const serviceSelectionRows = ((serviceRows ?? []) as unknown as BookingServiceJoinRow[]).map(
    serviceRowToSelectionRow,
  )
  const selections = [...packageSelectionRows, ...serviceSelectionRows].filter(
    (row) => row.selected && (!context.legIds || context.legIds.has(row.package_leg_id)),
  )

  const hotelDefaults =
    context.hotelDefaultTimes ??
    (selections.some((row) => firstRecord(row.suppliers)?.kind === "hotel_property")
      ? await getHotelDefaultTimes(supabase)
      : null)

  const requestsLine = buildRequestsLine(context.reservationDetails)
  const occasion = context.reservationDetails?.occasion?.trim() || null

  const blocks: VoucherServiceBlock[] = selections.flatMap((row, idx) => {
    const supplier = firstRecord(row.suppliers)
    const route = firstRecord(row.routes)
    const suite = firstRecord(row.suite_types)
    const leg = firstRecord(row.package_legs)

    const serviceType = mapSupplierKindToServiceType(supplier?.kind ?? null)
    const isHotel = serviceType === "hotel"
    const isTrain = serviceType === "train"

    const contactDetails: VoucherServiceBlockContact = {
      name: supplier?.name ?? null,
      phone: supplier?.phone ?? null,
      email: supplier?.email ?? null,
      website: supplier?.website ?? null,
      location: supplier?.location ?? null,
      description: supplier?.description ?? null,
      streetAddress: supplier?.street_address ?? null,
      emergencyPhone: supplier?.emergency_phone ?? null,
    }
    const supplierContactName = row.supplier_contact_name ?? supplier?.default_contact_name ?? null

    const title = leg?.label?.trim() || voucherServiceTypeLabel(serviceType)
    const displayOrder = leg?.sort_order ?? idx

    // A transfer leg renders one block per captured trip; the leg-level selection only supplies
    // the fallback vehicle category and supplier contact.
    if (serviceType === "transfer") {
      // row.package_leg_id is either a real package_legs.id or (for a Build Booking leg) a
      // booking_services.id stashed in the same field by serviceRowToSelectionRow -- a request
      // matches whichever of the two columns the leg system it came from actually set.
      const legRequests = transportRequests.filter(
        (request) => request.package_leg_id === row.package_leg_id || request.service_id === row.package_leg_id,
      )
      if (legRequests.length > 0) {
        return legRequests.map((request, requestIndex) =>
          transportRequestBlock(request, {
            title,
            // Fractional offsets keep a leg's trips in captured order within its slot.
            displayOrder: displayOrder + requestIndex / 100,
            contactDetails,
            supplier,
            fallbackVehicle: suite?.name ?? null,
            supplierReference: request.supplier_reference ?? null,
            travellerNames: context.travellerNames ?? null,
          }),
        )
      }
    }

    const serviceDate = row.service_date ?? null
    const nights = isHotel ? (row.nights && row.nights > 0 ? row.nights : null) : null
    const durationDays = route?.duration_days ?? null

    let arrivalDate: string | null = null
    if (serviceDate) {
      if (isHotel) {
        if (nights) arrivalDate = addDays(serviceDate, nights)
      } else if (durationDays && durationDays > 0) {
        // A 1-day route arrives on its departure day — still a real arrival date, so it must
        // print. Only an unconfigured duration leaves this null, where the voucher's "TBC" is
        // honest: silently claiming same-day arrival on a multi-day train would be a wrong
        // statement on a client document.
        arrivalDate = trainArrivalDate(serviceDate, durationDays)
      }
    }

    const startTime =
      toHoursMinutes(supplier?.default_time_start) ?? (isHotel ? hotelDefaults?.checkIn ?? null : null)
    const endTime =
      toHoursMinutes(supplier?.default_time_end) ?? (isHotel ? hotelDefaults?.checkOut ?? null : null)

    // A hotel leg's "route" is its meal plan (see lib/packages/apply-dialog-state.ts).
    const directedRouteName = resolveVoucherRouteName(route, row.route_reversed ?? false)
    const arrivalStation =
      serviceType === "train" ? resolveVoucherArrivalStation(route, row.route_reversed ?? false) : null
    const stationPoints = isTrain
      ? resolveStationPoints(supplier, route, row.route_reversed ?? false)
      : { boarding: null, arrival: null }
    const { names: suiteNames, unitCount } = resolveLegSuiteNames(row, serviceType === "train")
    const suiteName = suiteNames.length > 0 ? suiteNames.join(", ") : null
    const serviceData: VoucherServiceBlockData = {
      route: isHotel ? null : directedRouteName,
      arrivalStation,
      boardingPoint: stationPoints.boarding,
      arrivalPoint: stationPoints.arrival,
      mealPlan: isHotel ? route?.name ?? null : null,
      suiteType: suiteName,
      numberOfSuites: unitCount > 0 ? unitCount : null,
      roomType: isHotel ? suiteName : null,
      vehicleType: serviceType === "transfer" ? suite?.name ?? null : null,
      departureDate: serviceDate,
      arrivalDate,
      startTime,
      endTime,
      nights,
      durationDays,
      notes: row.notes ?? null,
      footnote: row.voucher_footnote ?? null,
      inclusions: cleanList(supplier?.inclusions),
      exclusions: cleanList(supplier?.exclusions),
      // The party's meal-seating/smoking/occasion preferences apply to the whole trip, so they're
      // repeated on every train/hotel block rather than tied to one leg.
      guestBreakdown: isTrain || isHotel ? sumUnitGuestBreakdown(row.units) : null,
      requestsLine: isTrain || isHotel ? requestsLine : null,
      occasion: isTrain || isHotel ? occasion : null,
      // A leg's own excursions override the route's defaults; only trains carry the concept today.
      excursions: isTrain ? (row.excursions?.length ? cleanList(row.excursions) : cleanList(route?.default_excursions)) : undefined,
      itinerary: serviceType === "tour" ? directedRouteName || row.notes || null : null,
    }

    return [
      {
        serviceType,
        title,
        supplierId: row.supplier_id,
        supplierReference: row.supplier_reference ?? null,
        supplierContactName,
        contactDetails,
        serviceData,
        displayOrder,
      },
    ]
  })

  // Manually added transfers (not tied to a package leg or a booking service) belong on the
  // documents too — except where the caller renders only what an accepted quote priced, since a
  // request linked to no leg can never have been priced (see `includeUnlinkedTransportRequests`).
  const manualRequests =
    context.includeUnlinkedTransportRequests === false
      ? []
      : transportRequests.filter((request) => !request.package_leg_id && !request.service_id)
  if (manualRequests.length > 0) {
    const orderBase = blocks.reduce((max, block) => Math.max(max, block.displayOrder), -1) + 1
    manualRequests.forEach((request, index) => {
      const supplier = firstRecord(request.suppliers)
      blocks.push(
        transportRequestBlock(request, {
          title: voucherServiceTypeLabel("transfer"),
          displayOrder: orderBase + index,
          contactDetails: {
            name: supplier?.name ?? null,
            phone: supplier?.phone ?? null,
            email: supplier?.email ?? null,
            website: supplier?.website ?? null,
            location: supplier?.location ?? null,
            description: supplier?.description ?? null,
            streetAddress: supplier?.street_address ?? null,
            emergencyPhone: supplier?.emergency_phone ?? null,
          },
          supplier,
          fallbackVehicle: null,
          supplierReference: request.supplier_reference ?? null,
          travellerNames: context.travellerNames ?? null,
        }),
      )
    })
  }

  if (context.additionalServicesDetails && context.additionalServicesDetails.trim()) {
    blocks.push({
      serviceType: "additional_service",
      title: "Additional Services",
      supplierReference: null,
      contactDetails: {},
      serviceData: { notes: context.additionalServicesDetails.trim() },
      displayOrder: blocks.length,
    })
  }

  return { blocks }
}
