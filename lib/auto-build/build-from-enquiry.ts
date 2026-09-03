import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isCoreBookingLeg, type SupplierKind } from "@/lib/types"
import { addDays } from "@/lib/packages/hotel-dates"
import { seedUnitsForServices } from "@/lib/packages/seed-service-units"

/** Nights an auto-built hotel *add-on* leg is seeded with -- see the service_date comment below.
 *  A standalone stay states its own length at intake and uses that instead. */
const HOTEL_AUTO_BUILD_NIGHTS = 1

type ServiceClient = SupabaseClient<Database>
type BookingServiceInsert = Database["public"]["Tables"]["booking_services"]["Insert"]

export interface AutoBuildInput {
  bookingId: string
  /**
   * The supplier this booking is FOR, already resolved (or null) by the caller -- this engine
   * never re-resolves or guesses. A train operator makes the booking a journey; a hotel makes it a
   * standalone stay (Kruger Shalati), where the hotel is the whole booking rather than an add-on.
   */
  primarySupplierId: string | null
  primarySupplierKind: SupplierKind | null
  /** An add-on stay hanging off the rail journey. Ignored on a standalone stay, where the primary
   *  supplier already is the hotel. */
  hotelSupplierId: string | null
  routeId: string | null
  /** Whether the rail leg is travelled opposite to the route's filed origin/destination -- see
   *  lib/resolvers/route-resolver.ts's findRouteMatch. Ignored for the hotel leg. */
  routeReversed?: boolean
  /** Trip start: the departure date on a journey, the check-in date on a standalone stay. */
  departureDate: string | null
  /** Standalone stays only: the length the customer asked for, check-out minus check-in. */
  nights?: number | null
  /**
   * Whether the hotel stay is before or after the rail journey, which decides the hotel leg's
   * service date:
   *   pre  -> the night before departure. The customer flies in and sleeps over so they can board
   *           the next morning; giving that night the departure date books them a bed for a night
   *           they are already on the train.
   *   post -> left null. That night happens after the trip ends, on a date this engine has no way
   *           to compute (trip length isn't known at intake).
   *   none / unstated -> the rail departure date, the closest available estimate.
   * Meaningless on a standalone stay, which anchors to nothing.
   */
  hotelPhase?: 'pre' | 'post' | 'none' | null
}

export interface AutoBuildResult {
  servicesCreated: number
  unitsCreated: number
  /** Human-readable reasons nothing (or less than everything) was built — surfaced in audit logs. */
  skipped: string[]
}

const NOOP_RESULT = (reason: string): AutoBuildResult => ({ servicesCreated: 0, unitsCreated: 0, skipped: [reason] })

/**
 * A supplier's only active route, or null when it files none or files several. One option is not a
 * guess -- picking it is the same reasoning as the never-guess resolvers, which fill a value only
 * when nothing else could have been meant. It matters most for a standalone stay: a hotel leg
 * cannot be priced without its meal plan (lib/quotes/build-from-package.ts), and Kruger Shalati
 * files exactly one, so without this every Shalati booking would stall on a manual pick.
 */
async function resolveSoleRouteId(supabase: ServiceClient, supplierId: string): Promise<string | null> {
  const { data: routes } = await supabase
    .from("routes")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("active", true)
    .limit(2)

  return routes?.length === 1 ? routes[0].id : null
}

/**
 * Composes a booking's initial services directly from facts already resolved at intake — never
 * a guess of its own, and never a catalogue package pick (a package asserts leg count, suppliers,
 * nights and routes all at once off one match; auto-build only ever states what was independently
 * confident). A consultant reviews and tweaks from here rather than starting from nothing.
 *
 * Mirrors buildDefaultPackageSelections' selection convention: only the core leg is auto-selected,
 * everything else stays opt-in until a consultant turns it on. On a journey that is the rail leg;
 * on a standalone stay it is the hotel, which is the booking rather than an extra hanging off one.
 * Suite/room units are carried over from the enquiry's captured suites via seedUnitsForServices,
 * which already skips any suite whose type didn't resolve — this engine adds no new suite logic.
 *
 * Idempotent: a booking that already has services is left untouched (re-running after the
 * consultant has started editing must never overwrite their work).
 */
export async function autoBuildBookingServices(
  supabase: ServiceClient,
  input: AutoBuildInput,
): Promise<AutoBuildResult> {
  if (!input.primarySupplierId) {
    // Nothing can be named with confidence. A train enquiry whose operator failed to resolve still
    // stops dead here rather than quietly building whatever hotel it did manage to match -- the
    // consultant is told, and no half-built booking exists to mislead them.
    return NOOP_RESULT("No primary supplier resolved — nothing built")
  }

  const { data: existingServices, error: existingError } = await supabase
    .from("booking_services")
    .select("id")
    .eq("booking_id", input.bookingId)

  if (existingError) return NOOP_RESULT(`Failed to check existing services: ${existingError.message}`)
  if ((existingServices ?? []).length > 0) return NOOP_RESULT("Booking already has services — left untouched")

  const isStandaloneStay = input.primarySupplierKind === "hotel_property"
  // On a standalone stay the primary supplier already IS the hotel, so an add-on hotel id pointing
  // at the same row would build the same leg twice.
  const addOnHotelSupplierId =
    isStandaloneStay || input.hotelSupplierId === input.primarySupplierId ? null : input.hotelSupplierId

  const supplierIds = [input.primarySupplierId, addOnHotelSupplierId].filter(
    (id): id is string => Boolean(id),
  )
  const { data: supplierRows, error: suppliersError } = await supabase
    .from("suppliers")
    .select("id, kind")
    .in("id", supplierIds)

  if (suppliersError) return NOOP_RESULT(`Failed to load suppliers: ${suppliersError.message}`)

  const kindBySupplierId = new Map((supplierRows ?? []).map((row) => [row.id, row.kind]))
  const skipped: string[] = []

  interface PlannedService {
    supplierId: string
    kind: SupplierKind
  }
  const planned: PlannedService[] = []

  const primaryKind = kindBySupplierId.get(input.primarySupplierId)
  if (primaryKind) {
    planned.push({ supplierId: input.primarySupplierId, kind: primaryKind })
  } else {
    skipped.push("Resolved primary supplier id no longer matches an active supplier")
  }

  if (addOnHotelSupplierId) {
    const hotelKind = kindBySupplierId.get(addOnHotelSupplierId)
    if (hotelKind) {
      planned.push({ supplierId: addOnHotelSupplierId, kind: hotelKind })
    } else {
      skipped.push("Resolved hotel supplier id no longer matches an active supplier")
    }
  }

  if (planned.length === 0) return { servicesCreated: 0, unitsCreated: 0, skipped }

  // A standalone stay's meal plan decides whether its quote can be priced at all, so fill it when
  // the supplier files exactly one. A journey's route came from intake's own route match.
  const primaryRouteId = isStandaloneStay
    ? await resolveSoleRouteId(supabase, input.primarySupplierId)
    : input.routeId
  if (isStandaloneStay && !primaryRouteId) {
    skipped.push("Meal plan not set — this supplier files more than one, so it must be chosen in Build Booking")
  }

  const stayNights = input.nights && input.nights > 0 ? input.nights : HOTEL_AUTO_BUILD_NIGHTS

  const serviceRows: BookingServiceInsert[] = planned.map((service, index) => {
    const isPrimaryLeg = service.supplierId === input.primarySupplierId
    const isAddOnHotelLeg = !isPrimaryLeg && service.supplierId === addOnHotelSupplierId

    // A pre-departure stay is the night *before* the train leaves, so it can only be dated once
    // a departure date exists. HOTEL_AUTO_BUILD_NIGHTS keeps the stay length agreeing with that
    // date -- resolveHotelStayDates derives check-in the same way (departure - nights), so a
    // consultant editing nights later stays consistent with what was seeded here. A standalone
    // stay skips all of it: its check-in is stated outright and anchors to nothing.
    let serviceDate = input.departureDate
    if (isAddOnHotelLeg && input.hotelPhase === 'post') {
      serviceDate = null
    } else if (isAddOnHotelLeg && input.hotelPhase === 'pre' && input.departureDate) {
      serviceDate = addDays(input.departureDate, -HOTEL_AUTO_BUILD_NIGHTS)
    }

    return {
      id: crypto.randomUUID(),
      booking_id: input.bookingId,
      supplier_id: service.supplierId,
      // Route is set only for the primary leg -- the one entity a route was resolved for at intake
      // (or, for a standalone stay, the supplier's sole meal plan). An add-on hotel leg has no
      // meal-plan signal an enquiry could have carried.
      route_id: isPrimaryLeg ? primaryRouteId : null,
      route_reversed: isPrimaryLeg && service.kind === "train_operator" ? (input.routeReversed ?? false) : false,
      service_date: serviceDate,
      // The enquiry never states a night count for an add-on stay, so a single night is the
      // conservative default. A standalone stay states its own length: check-out minus check-in.
      nights: service.kind === "hotel_property" ? (isPrimaryLeg ? stayNights : HOTEL_AUTO_BUILD_NIGHTS) : null,
      // A standalone stay has no train to anchor to, so its dates are its own -- see
      // lib/packages/hotel-dates.ts, which already returns null for an unanchorable stay.
      date_anchor: isAddOnHotelLeg ? null : service.kind === "hotel_property" ? "custom" : null,
      // Mirrors buildDefaultPackageSelections: only the core leg starts selected, every optional
      // leg (add-on hotel, transfer, ...) stays opt-in until a consultant turns it on.
      selected: isCoreBookingLeg(
        { supplierId: service.supplierId, supplierKind: service.kind },
        input.primarySupplierId,
      ),
      sort_order: index,
      origin: "auto",
    }
  })

  const { error: insertError } = await supabase.from("booking_services").insert(serviceRows)
  if (insertError) return NOOP_RESULT(`Failed to insert services: ${insertError.message}`)

  const seedResult = await seedUnitsForServices(
    supabase,
    input.bookingId,
    serviceRows.map((row) => ({
      id: row.id as string,
      supplier_id: row.supplier_id,
      kind: kindBySupplierId.get(row.supplier_id) ?? null,
    })),
    { tripStartDate: input.departureDate, tripEndDate: null },
    "auto",
  )
  if (seedResult.error) skipped.push(`Services created, but seeding suite units failed: ${seedResult.error}`)

  const { data: unitRows } = await supabase
    .from("booking_service_units")
    .select("id")
    .in(
      "service_id",
      serviceRows.map((row) => row.id as string),
    )

  return { servicesCreated: serviceRows.length, unitsCreated: (unitRows ?? []).length, skipped }
}
