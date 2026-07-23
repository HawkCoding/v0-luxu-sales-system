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
import { resolveDirectedRouteName } from "@/lib/routes/route-name"
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
  supplierReferenceFallback?: string | null
  additionalServicesDetails?: string | null
  /** Fallback check-in/check-out times when a hotel has no default times of its own. */
  hotelDefaultTimes?: HotelDefaultTimes
  /** When set, restricts package-leg selections (and their leg-scoped transport requests) to
   * these leg ids — scopes a specific quote version's itinerary to what was actually priced into
   * it, instead of whatever is currently selected live on the job. Manually-added transport
   * requests (no package leg) are never priced this way and stay unfiltered. */
  legIds?: Set<string>
}

interface SupplierJoin {
  name: string | null
  phone: string | null
  email: string | null
  website: string | null
  location: string | null
  kind: SupplierKind | string | null
  default_time_start: string | null
  default_time_end: string | null
  inclusions: string[] | null
  exclusions: string[] | null
}

interface RouteJoin {
  name: string | null
  duration_days: number | null
  direction_mode: string | null
  origin: { name: string | null } | { name: string | null }[] | null
  destination: { name: string | null } | { name: string | null }[] | null
}

interface TransportRequestJoinRow {
  id: string
  package_leg_id: string | null
  service_type: string
  pickup_point: string
  dropoff_point: string
  pickup_at: string | null
  flight_number: string | null
  notes: string | null
  sort_order: number
  supplier_reference: string | null
  suppliers: SupplierJoin | SupplierJoin[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  rental_details:
    | { return_at: string | null }
    | { return_at: string | null }[]
    | null
}

interface SelectionUnitJoinRow {
  suite_type_id: string | null
  sort_order: number
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
  package_legs: { sort_order: number; label: string | null } | { sort_order: number; label: string | null }[] | null
  suppliers: SupplierJoin | SupplierJoin[] | null
  routes: RouteJoin | RouteJoin[] | null
  suite_types: { name: string | null } | { name: string | null }[] | null
  /** Per-suite/room unit rows (train & hotel legs only). Suite type moved here — the
   * leg-level suite_type_id/suite_types join is now a legacy fallback for pre-cutover rows. */
  units: SelectionUnitJoinRow[] | null
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

/** The route name as it should read on client documents: the canonical name, unless it's a
 * two-way route with resolvable endpoint names, in which case it renders the booked direction. */
function resolveVoucherRouteName(route: RouteJoin | null | undefined, reversed: boolean): string | null {
  if (!route) return null
  const origin = firstRecord(route.origin)?.name
  const destination = firstRecord(route.destination)?.name
  if (route.direction_mode !== "round_trip" || !origin || !destination) return route.name
  return resolveDirectedRouteName(origin, destination, reversed)
}

interface TransportBlockContext {
  title: string
  displayOrder: number
  contactDetails: VoucherServiceBlockContact
  supplier: SupplierJoin | null | undefined
  /** Leg-level vehicle category, used when the request doesn't set its own. */
  fallbackVehicle: string | null
  supplierReference: string | null
}

/** One captured transfer/rental trip → one client-facing block: the typed pickup/drop-off and
 * pickup time are authoritative; rentals also carry their return date/time. */
function transportRequestBlock(
  request: TransportRequestJoinRow,
  blockContext: TransportBlockContext,
): VoucherServiceBlock {
  const requestSuite = firstRecord(request.suite_types)
  const rental = firstRecord(request.rental_details)
  const isRental = request.service_type === "rental"

  return {
    serviceType: "transfer",
    title: blockContext.title,
    supplierReference: blockContext.supplierReference,
    contactDetails: blockContext.contactDetails,
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
      notes: request.notes,
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
      `id, package_leg_id, selected, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, notes, supplier_reference,
       package_legs(sort_order, label),
       suppliers(name, phone, email, website, location, kind, default_time_start, default_time_end, inclusions, exclusions),
       routes(name, duration_days, direction_mode, origin:locations!routes_origin_location_id_fkey(name), destination:locations!routes_destination_location_id_fkey(name)),
       suite_types(name),
       units:booking_package_selection_units(suite_type_id, sort_order, suite_types(name), bedroom_types(name), bedroom_layouts(name), bathroom_types(name))`,
    )
    .eq("booking_id", context.bookingId)

  if (error) throw error

  // Transfers/rentals render from what the salesperson actually captured per trip — the typed
  // pickup/drop-off, pickup time and flight — never from a route's static points.
  const { data: transportRows, error: transportError } = await supabase
    .from("booking_transport_requests")
    .select(
      `id, package_leg_id, service_type, pickup_point, dropoff_point, pickup_at, flight_number, notes, sort_order, supplier_reference,
       suppliers(name, phone, email, website, location, kind, default_time_start, default_time_end, inclusions, exclusions),
       suite_types(name),
       rental_details:booking_vehicle_rental_details(return_at)`,
    )
    .eq("booking_id", context.bookingId)
    .order("sort_order", { ascending: true })

  if (transportError) throw transportError
  const transportRequests = (transportRows ?? []) as unknown as TransportRequestJoinRow[]

  const selections = ((rows ?? []) as unknown as SelectionJoinRow[]).filter(
    (row) => row.selected && (!context.legIds || context.legIds.has(row.package_leg_id)),
  )

  const hotelDefaults =
    context.hotelDefaultTimes ??
    (selections.some((row) => firstRecord(row.suppliers)?.kind === "hotel_property")
      ? await getHotelDefaultTimes(supabase)
      : null)

  const blocks: VoucherServiceBlock[] = selections.flatMap((row, idx) => {
    const supplier = firstRecord(row.suppliers)
    const route = firstRecord(row.routes)
    const suite = firstRecord(row.suite_types)
    const leg = firstRecord(row.package_legs)

    const serviceType = mapSupplierKindToServiceType(supplier?.kind ?? null)
    const isHotel = serviceType === "hotel"

    const contactDetails: VoucherServiceBlockContact = {
      name: supplier?.name ?? null,
      phone: supplier?.phone ?? null,
      email: supplier?.email ?? null,
      website: supplier?.website ?? null,
      location: supplier?.location ?? null,
    }

    const title = leg?.label?.trim() || voucherServiceTypeLabel(serviceType)
    const displayOrder = leg?.sort_order ?? idx

    // A transfer leg renders one block per captured trip; the leg-level selection only supplies
    // the fallback vehicle category and supplier contact.
    if (serviceType === "transfer") {
      const legRequests = transportRequests.filter(
        (request) => request.package_leg_id === row.package_leg_id,
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
            supplierReference: request.supplier_reference ?? context.supplierReferenceFallback ?? null,
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
      } else if (durationDays && durationDays > 1) {
        arrivalDate = trainArrivalDate(serviceDate, durationDays)
      }
    }

    const startTime =
      toHoursMinutes(supplier?.default_time_start) ?? (isHotel ? hotelDefaults?.checkIn ?? null : null)
    const endTime =
      toHoursMinutes(supplier?.default_time_end) ?? (isHotel ? hotelDefaults?.checkOut ?? null : null)

    // A hotel leg's "route" is its meal plan (see lib/packages/apply-dialog-state.ts).
    const directedRouteName = resolveVoucherRouteName(route, row.route_reversed ?? false)
    const { names: suiteNames, unitCount } = resolveLegSuiteNames(row, serviceType === "train")
    const suiteName = suiteNames.length > 0 ? suiteNames.join(", ") : null
    const serviceData: VoucherServiceBlockData = {
      route: isHotel ? null : directedRouteName,
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
      inclusions: cleanList(supplier?.inclusions),
      exclusions: cleanList(supplier?.exclusions),
    }

    return [
      {
        serviceType,
        title,
        supplierReference: row.supplier_reference ?? context.supplierReferenceFallback ?? null,
        contactDetails,
        serviceData,
        displayOrder,
      },
    ]
  })

  // Manually added transfers (not tied to a package leg) belong on the documents too.
  const manualRequests = transportRequests.filter((request) => !request.package_leg_id)
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
          },
          supplier,
          fallbackVehicle: null,
          supplierReference: request.supplier_reference ?? context.supplierReferenceFallback ?? null,
        }),
      )
    })
  }

  if (context.additionalServicesDetails && context.additionalServicesDetails.trim()) {
    blocks.push({
      serviceType: "additional_service",
      title: "Additional Services",
      supplierReference: context.supplierReferenceFallback ?? null,
      contactDetails: {},
      serviceData: { notes: context.additionalServicesDetails.trim() },
      displayOrder: blocks.length,
    })
  }

  return { blocks }
}
