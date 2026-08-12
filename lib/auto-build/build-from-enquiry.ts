import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isOptionalPackageLegKind, type SupplierKind } from "@/lib/types"
import { addDays } from "@/lib/packages/hotel-dates"
import { seedUnitsForServices } from "@/lib/packages/seed-service-units"

/** Nights an auto-built hotel leg is seeded with — see the service_date comment below. */
const HOTEL_AUTO_BUILD_NIGHTS = 1

type ServiceClient = SupabaseClient<Database>
type BookingServiceInsert = Database["public"]["Tables"]["booking_services"]["Insert"]

export interface AutoBuildInput {
  bookingId: string
  /** Already resolved (or null) by the caller — this engine never re-resolves or guesses. */
  trainSupplierId: string | null
  hotelSupplierId: string | null
  routeId: string | null
  /** Whether the rail leg is travelled opposite to the route's filed origin/destination — see
   *  lib/resolvers/route-resolver.ts's findRouteMatch. Ignored for the hotel leg. */
  routeReversed?: boolean
  departureDate: string | null
  /**
   * Whether the hotel stay is before or after the rail journey, which decides the hotel leg's
   * service date:
   *   pre  -> the night before departure. The customer flies in and sleeps over so they can board
   *           the next morning; giving that night the departure date books them a bed for a night
   *           they are already on the train.
   *   post -> left null. That night happens after the trip ends, on a date this engine has no way
   *           to compute (trip length isn't known at intake).
   *   none / unstated -> the rail departure date, the closest available estimate.
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
 * Composes a booking's initial services directly from facts already resolved at intake — never
 * a guess of its own, and never a catalogue package pick (a package asserts leg count, suppliers,
 * nights and routes all at once off one match; auto-build only ever states what was independently
 * confident). A consultant reviews and tweaks from here rather than starting from nothing.
 *
 * Mirrors buildDefaultPackageSelections' selection convention: only the rail leg is auto-selected,
 * everything else stays opt-in until a consultant turns it on. Suite/room units are carried over
 * from the enquiry's captured suites via seedUnitsForServices, which already skips any suite whose
 * type didn't resolve — this engine adds no new suite logic of its own.
 *
 * Idempotent: a booking that already has services is left untouched (re-running after the
 * consultant has started editing must never overwrite their work).
 */
export async function autoBuildBookingServices(
  supabase: ServiceClient,
  input: AutoBuildInput,
): Promise<AutoBuildResult> {
  if (!input.trainSupplierId) {
    // No confidently resolved train operator means nothing can be named with confidence — every
    // other fact (hotel, route, suites) is secondary to the rail leg an operator enquiry is for.
    return NOOP_RESULT("No train operator resolved — nothing built")
  }

  const { data: existingServices, error: existingError } = await supabase
    .from("booking_services")
    .select("id")
    .eq("booking_id", input.bookingId)

  if (existingError) return NOOP_RESULT(`Failed to check existing services: ${existingError.message}`)
  if ((existingServices ?? []).length > 0) return NOOP_RESULT("Booking already has services — left untouched")

  const supplierIds = [input.trainSupplierId, input.hotelSupplierId].filter(
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
    kind: string
  }
  const planned: PlannedService[] = []

  const trainKind = kindBySupplierId.get(input.trainSupplierId)
  if (trainKind) {
    planned.push({ supplierId: input.trainSupplierId, kind: trainKind })
  } else {
    skipped.push("Resolved train supplier id no longer matches an active supplier")
  }

  if (input.hotelSupplierId) {
    const hotelKind = kindBySupplierId.get(input.hotelSupplierId)
    if (hotelKind) {
      planned.push({ supplierId: input.hotelSupplierId, kind: hotelKind })
    } else {
      skipped.push("Resolved hotel supplier id no longer matches an active supplier")
    }
  }

  if (planned.length === 0) return { servicesCreated: 0, unitsCreated: 0, skipped }

  const serviceRows: BookingServiceInsert[] = planned.map((service, index) => {
    const isTrainLeg = service.supplierId === input.trainSupplierId
    const isHotelLeg = !isTrainLeg && service.supplierId === input.hotelSupplierId

    // A pre-departure stay is the night *before* the train leaves, so it can only be dated once
    // a departure date exists. HOTEL_AUTO_BUILD_NIGHTS keeps the stay length agreeing with that
    // date -- resolveHotelStayDates derives check-in the same way (departure - nights), so a
    // consultant editing nights later stays consistent with what was seeded here.
    let serviceDate = input.departureDate
    if (isHotelLeg && input.hotelPhase === 'post') {
      serviceDate = null
    } else if (isHotelLeg && input.hotelPhase === 'pre' && input.departureDate) {
      serviceDate = addDays(input.departureDate, -HOTEL_AUTO_BUILD_NIGHTS)
    }

    return {
      id: crypto.randomUUID(),
      booking_id: input.bookingId,
      supplier_id: service.supplierId,
      // Route is set only for the rail leg -- the one entity a resolved routeId was ever computed
      // for at intake; a hotel leg has no route/meal-plan signal to fill from an enquiry.
      route_id: isTrainLeg ? input.routeId : null,
      route_reversed: isTrainLeg ? (input.routeReversed ?? false) : false,
      service_date: serviceDate,
      // The enquiry never states a night count, so a single night is the conservative default --
      // enough to date the stay, and the number a consultant is most likely to keep.
      nights: isHotelLeg ? HOTEL_AUTO_BUILD_NIGHTS : null,
      // Mirrors buildDefaultPackageSelections: only the rail leg starts selected, every optional
      // kind (hotel, transfer, ...) stays opt-in until a consultant turns it on.
      selected: !isOptionalPackageLegKind(service.kind as SupplierKind),
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
