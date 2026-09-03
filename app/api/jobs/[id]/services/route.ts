import { z } from "zod"
import { NextResponse, after } from "next/server"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadAllowedSuiteVariantIds, findInvalidVariantField } from "@/lib/packages/suite-config"
import { computeLegPassengerTotals } from "@/lib/packages/passenger-totals"
import { recomputeBookingTripDates } from "@/lib/packages/recompute-trip-dates"
import { learnSuiteAliasesFromUnits } from "@/lib/suites/learn-from-units"
import { createServiceClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

/**
 * Build Booking's equivalent of PATCH /api/jobs/[id]/package-selections, operating on
 * booking_services/booking_service_units, which replaced the removed catalogue tables. A
 * booking_services row already is the leg and the selection collapsed into one (see
 * supabase/migrations/20260729100000_booking_services.sql), so there is no separate
 * package_leg_id lookup step here — the request's "packageLegId" field is the booking_services
 * row's own id. The field name is kept identical to the catalogue endpoint's request/response
 * shape so lib/packages/apply-dialog-state.ts's converters (toPackageSelectionsPatch,
 * hydrateFromSaved, SavedPackageState) are shared unmodified between both flows.
 */

import { isCoreBookingLeg, type SupplierKind } from "@/lib/types"
import { normaliseCurrency } from "@/lib/money"
import { PASSENGER_SUM_SUPPLIER_KINDS } from "@/lib/packages/apply-dialog-state"

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

/** IATA is 3 letters, ICAO 4 — both accepted, stored uppercase so the voucher's "CPT at 16h20"
 * row never depends on how the consultant typed it. */
const airportCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3,4}$/, "Expected a 3- or 4-letter airport code")
  .transform((code) => code.toUpperCase())

/** Airline-only fields on a leg. Rejected on every other supplier kind — see the guard in PATCH. */
const FLIGHT_SCHEDULE_FIELDS = [
  "departureTime",
  "arrivalDate",
  "arrivalTime",
  "flightNumber",
  "departureAirportCode",
  "arrivalAirportCode",
  "handLuggageKg",
  "checkedLuggageKg",
] as const

const TRANSPORT_SUPPLIER_KINDS = new Set(["transfers", "vehicle_rental"])

const selectionUnitSchema = z.object({
  id: z.string().uuid().optional(),
  suiteTypeId: z.string().uuid().nullable(),
  bedroomTypeId: z.string().uuid().nullable().optional(),
  bedroomLayoutId: z.string().uuid().nullable().optional(),
  bathroomTypeId: z.string().uuid().nullable().optional(),
  adultCount: z.number().int().nonnegative().default(0),
  childCount: z.number().int().nonnegative().default(0),
  infantCount: z.number().int().nonnegative().default(0),
  sortOrder: z.number().int().nonnegative().optional(),
  /** Manual-pricing legs only (e.g. airlines): the typed fare for this unit's cabin. */
  manualAdultPrice: z.number().nonnegative().nullable().optional(),
  manualChildPrice: z.number().nonnegative().nullable().optional(),
  manualInfantPrice: z.number().nonnegative().nullable().optional(),
  /** Hotel legs only: this room's typed price per room per night, replacing its rate card for
   * this booking. Rejected on any other supplier kind — see the guard in PATCH. */
  manualRoomPrice: z.number().nonnegative().nullable().optional(),
  /** Hotel legs only: the hotel gifted this room's first night, so the quote charges nights - 1
   * at whatever the room's per-night price is. Rejected on any other supplier kind. */
  complimentaryFirstNight: z.boolean().optional(),
  /** Tour legs only: this unit's typed flat price, replacing its rate-card-computed total.
   * Rejected on any other supplier kind — see the guard in PATCH. */
  manualTourPrice: z.number().nonnegative().nullable().optional(),
  /** Tour legs only: this unit's own rate type, overriding the leg-level rateTypeId below.
   * Rejected on any other supplier kind — see the guard in PATCH. */
  rateTypeId: z.string().uuid().nullable().optional(),
})

const updateServiceSchema = z.object({
  packageLegId: z.string().uuid(),
  /** booking_services.updated_at as the client last read it. Sent by the Build Booking dialog so a
   * second consultant's concurrent save is rejected instead of silently overwritten. Optional:
   * a client that doesn't track versions keeps the old last-write-wins behaviour. */
  expectedUpdatedAt: z.string().optional(),
  selected: z.boolean().optional(),
  // A service's supplier is fixed at creation (build-booking/route.ts) and never edited here --
  // unlike a catalogue selection's supplier_id, booking_services.supplier_id is NOT NULL, so
  // there is nothing to clear. Accepted (and ignored) only so a client that still sends the
  // catalogue endpoint's full payload shape doesn't fail validation.
  supplierId: z.string().uuid().nullable().optional(),
  routeId: z.string().uuid().nullable().optional(),
  routeReversed: z.boolean().optional(),
  serviceDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
  nights: z.number().int().positive().nullable().optional(),
  /** Airline legs only. `serviceDate` is the departure date; only the time is separate here.
   * `arrivalDate` is a full date rather than a day offset so an overnight flight states a real
   * arrival day. All rejected on any other supplier kind — see the guard in PATCH. */
  departureTime: z.string().regex(timePattern, "Expected HH:MM").nullable().optional(),
  arrivalDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
  arrivalTime: z.string().regex(timePattern, "Expected HH:MM").nullable().optional(),
  flightNumber: z.string().trim().min(2).max(20).nullable().optional(),
  departureAirportCode: airportCodeSchema.nullable().optional(),
  arrivalAirportCode: airportCodeSchema.nullable().optional(),
  handLuggageKg: z.number().nonnegative().nullable().optional(),
  checkedLuggageKg: z.number().nonnegative().nullable().optional(),
  dateAnchor: z.enum(["pre", "post", "custom"]).nullable().optional(),
  rateTypeId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** Hotel legs only: the property lets guests store luggage at reception, printed as a suffix on
   * the quote itinerary's check-out line. Rejected on any other supplier kind — see the guard in
   * PATCH. */
  luggageStorageAvailable: z.boolean().optional(),
  /** Internal supplier-booking record — when this leg was placed, confirmed and paid with the
   * supplier. Never shown to the customer, feeds the booking worksheet. Available on every
   * supplier kind: an admin fact about the booking, not about how the leg prices. */
  bookingDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
  confirmationDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
  paymentMadeDate: z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable().optional(),
  paidWith: z.string().trim().max(100).nullable().optional(),
  /** The currency this leg's hand-typed prices are in — manual-pricing fares and transfer/
   * rental overrides. Rate-card legs price off the card's own currency and ignore this. Dialog
   * state can carry forward a pre-enum legacy value from price_currency (free text, no CHECK
   * constraint) even when this particular save has nothing to do with currency, so this
   * normalises rather than rejects — an unrelated edit must not be blocked by stale data. */
  priceCurrency: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value ? normaliseCurrency(value) : undefined)),
  units: z.array(selectionUnitSchema).optional(),
})

const patchServicesSchema = z.object({
  selections: z.array(updateServiceSchema).min(1, "At least one selection is required"),
  /** Skips the trip-date recompute (5 sequential reads) when the caller knows a transport-requests
   * PUT immediately follows and will recompute from the final state of both tables anyway — see
   * PUT /api/jobs/[id]/transport-requests. Defaults to false so every other caller is unaffected. */
  deferTripDateRecompute: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

type BookingServiceUpdate = Database["public"]["Tables"]["booking_services"]["Update"]
type BookingServiceUnitInsert = Database["public"]["Tables"]["booking_service_units"]["Insert"]

const SERVICES_WITH_UNITS_SELECT =
  "id, booking_id, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, date_anchor, rate_type_id, notes, selected, origin, sort_order, price_currency, updated_at, " +
  "departure_time, arrival_date, arrival_time, flight_number, departure_airport_code, arrival_airport_code, hand_luggage_kg, checked_luggage_kg, " +
  "luggage_storage_available, booking_date, confirmation_date, payment_made_date, paid_with, " +
  "units:booking_service_units(id, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id, adult_count, child_count, infant_count, sort_order, manual_adult_price, manual_child_price, manual_infant_price, manual_room_price, manual_room_price_set_at, complimentary_first_night, rate_type_id)"

/**
 * GET only. Build Booking's step 1 lists a booking's services by supplier name and kind, which is
 * all it renders -- so carrying the name/kind here lets the dialog paint that list off this read
 * instead of waiting on the far heavier GET /build-booking payload (every route, rate card and
 * suite type for every supplier on the booking) that step 2 actually needs.
 *
 * Deliberately separate from SERVICES_WITH_UNITS_SELECT so PATCH's reload response below keeps its
 * existing shape -- a read-path speedup has no business changing what a write returns.
 */
const SERVICES_WITH_SUPPLIER_SELECT = `${SERVICES_WITH_UNITS_SELECT}, suppliers(name, kind)`

interface ServiceUnitRow {
  id: string
  suite_type_id: string | null
  bedroom_type_id: string | null
  bedroom_layout_id: string | null
  bathroom_type_id: string | null
  adult_count: number
  child_count: number
  infant_count: number
  sort_order: number
  manual_adult_price: number | null
  manual_child_price: number | null
  manual_infant_price: number | null
  manual_room_price: number | null
  manual_room_price_set_at: string | null
  complimentary_first_night: boolean
  rate_type_id: string | null
}

interface ServiceWithUnitsRow {
  id: string
  booking_id: string
  supplier_id: string
  route_id: string | null
  route_reversed: boolean
  suite_type_id: string | null
  service_date: string | null
  nights: number | null
  date_anchor: string | null
  rate_type_id: string | null
  notes: string | null
  departure_time: string | null
  arrival_date: string | null
  arrival_time: string | null
  flight_number: string | null
  departure_airport_code: string | null
  arrival_airport_code: string | null
  hand_luggage_kg: number | null
  checked_luggage_kg: number | null
  luggage_storage_available: boolean
  booking_date: string | null
  confirmation_date: string | null
  payment_made_date: string | null
  paid_with: string | null
  selected: boolean
  origin: "auto" | "consultant"
  sort_order: number
  price_currency: string
  updated_at: string
  units: ServiceUnitRow[]
}

interface SupplierJoinRow {
  name: string
  kind: SupplierKind
}

interface ServiceWithSupplierRow extends ServiceWithUnitsRow {
  /** PostgREST returns an embedded to-one relation as an object, but has shipped it as a
   *  single-element array in the past -- normalise rather than trust one shape. */
  suppliers: SupplierJoinRow | SupplierJoinRow[] | null
}

/** Saved-state read, shaped exactly like GET /api/jobs/[id]/package so the dialog's
 * hydrateFromSaved/SavedPackageState code works unmodified against either source. */
export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id, trip_start_date, trip_end_date, services_confirmed_at, services_confirmed_by, primary_supplier_id",
    )
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services:get-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  // Who confirmed the list and when: stored since the confirm route landed, but nothing showed it,
  // so a reopened dialog looked identical to one that had never been auto-built.
  let servicesConfirmedByName: string | null = null
  if (booking.services_confirmed_by) {
    const { data: confirmer } = await supabase
      .from("profiles")
      .select("name, surname, email")
      .eq("user_id", booking.services_confirmed_by)
      .maybeSingle()
    if (confirmer) {
      servicesConfirmedByName =
        [confirmer.name, confirmer.surname].filter(Boolean).join(" ").trim() || confirmer.email || null
    }
  }

  const { data: services, error: servicesError } = await supabase
    .from("booking_services")
    .select(SERVICES_WITH_SUPPLIER_SELECT)
    .eq("booking_id", id)
    // Was unordered, so the returned service order was whatever Postgres happened to give back.
    // Build Booking's step 1 renders this list directly, and it has to agree with the leg order
    // step 2 shows (which does sort by sort_order).
    .order("sort_order", { ascending: true })

  if (servicesError) return safeSupabaseError("services:get-services", servicesError)

  const serviceRows = (services ?? []) as unknown as ServiceWithSupplierRow[]

  return Response.json({
    // No catalogue package concept here; the presence of service rows is the signal instead.
    packageId: serviceRows.length > 0 ? id : null,
    // Which leg the booking exists for -- the one step 2 refuses to let a consultant
    // untick. A train on a journey, the hotel on a standalone stay.
    primarySupplierId: booking.primary_supplier_id,
    tripStartDate: booking.trip_start_date,
    tripEndDate: booking.trip_end_date,
    servicesConfirmedAt: booking.services_confirmed_at,
    servicesConfirmedByName,
    // The join is flattened to two scalars rather than passed through as a nested object: every
    // existing consumer of `selections` reads flat snake_case fields, so this stays additive.
    selections: serviceRows.map(({ suppliers, ...row }) => {
      const supplier = Array.isArray(suppliers) ? suppliers[0] ?? null : suppliers
      return {
        ...row,
        package_leg_id: row.id,
        supplier_name: supplier?.name ?? null,
        supplier_kind: supplier?.kind ?? null,
      }
    }),
  })
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchServicesSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, no_of_adults, no_of_children, child_ages, primary_supplier_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const serviceIds = parsed.data.selections.map((selection) => selection.packageLegId)
  const { data: validServices, error: servicesLoadError } = await supabase
    .from("booking_services")
    .select("id, supplier_id, updated_at, service_date, booking_date, suppliers(kind, name)")
    .eq("booking_id", id)
    .in("id", serviceIds)

  if (servicesLoadError) return safeSupabaseError("services:load-services", servicesLoadError)

  const serviceById = new Map((validServices ?? []).map((row) => [row.id, row]))
  const invalid = serviceIds.filter((serviceId) => !serviceById.has(serviceId))
  if (invalid.length > 0) {
    return jsonError("Selections reference services outside this booking", 400, { invalidServiceIds: invalid })
  }

  // Optimistic lock, checked across every selection before a single write lands: two consultants
  // saving the same booking used to both get a 200, with the later save silently erasing the
  // earlier one. Mirrors PATCH /api/jobs/[id]'s STALE_VERSION contract.
  const staleSelections = parsed.data.selections.filter((selection) => {
    if (!selection.expectedUpdatedAt) return false
    const stored = serviceById.get(selection.packageLegId)?.updated_at
    return Boolean(stored) && Date.parse(stored as string) !== Date.parse(selection.expectedUpdatedAt)
  })

  if (staleSelections.length > 0) {
    const first = staleSelections[0]
    return NextResponse.json(
      {
        error:
          "Someone else changed this booking's services while you were editing. Close and reopen the dialog to pick up their changes.",
        code: "STALE_VERSION",
        packageLegId: first.packageLegId,
        currentUpdatedAt: serviceById.get(first.packageLegId)?.updated_at ?? null,
        staleLegIds: staleSelections.map((selection) => selection.packageLegId),
      },
      { status: 409 },
    )
  }

  // `selected` drives voucher inclusion but is a no-op for pricing on the core leg
  // (lib/quotes/build-from-package.ts), so unticking the train used to leave the customer paying
  // for a journey the voucher never mentions. The core leg is the booking: refuse instead. On a
  // standalone stay the core leg is the hotel, not a train -- see isCoreBookingLeg.
  for (const selection of parsed.data.selections) {
    if (selection.selected !== false) continue
    const service = serviceById.get(selection.packageLegId)
    const supplier = Array.isArray(service?.suppliers) ? service.suppliers[0] : service?.suppliers
    const supplierKind = supplier?.kind as SupplierKind | undefined
    if (
      supplierKind &&
      isCoreBookingLeg(
        { supplierId: service?.supplier_id ?? null, supplierKind },
        booking.primary_supplier_id,
      )
    ) {
      return jsonError(
        `${supplier?.name ?? "This service"} is what this booking is for and cannot be excluded from the quote or the voucher.`,
        400,
        { packageLegId: selection.packageLegId, supplierKind },
      )
    }
  }

  // A flight schedule describes one specific flight. On any other kind these fields would be a
  // stored value nothing reads, so they are refused rather than silently kept — the same rule the
  // hotel-only room-price override follows below.
  for (const selection of parsed.data.selections) {
    const touchesFlightFields = FLIGHT_SCHEDULE_FIELDS.some((field) => selection[field] !== undefined)
    if (!touchesFlightFields) continue

    const service = serviceById.get(selection.packageLegId)
    const supplier = Array.isArray(service?.suppliers) ? service.suppliers[0] : service?.suppliers
    const supplierKind = supplier?.kind
    if (supplierKind !== "airline") {
      return jsonError("Flight schedule fields are only available on airline services", 400, {
        packageLegId: selection.packageLegId,
        supplierKind,
      })
    }

    // The DB rejects an arrival before the departure day; a same-day arrival at or before the
    // departure time needs both fields together, so it is checked here. An omitted serviceDate
    // means the stored departure date still applies.
    const departureDate =
      selection.serviceDate !== undefined ? selection.serviceDate : service?.service_date ?? null
    if (selection.arrivalDate && departureDate) {
      if (selection.arrivalDate < departureDate) {
        return jsonError("A flight cannot arrive before it departs", 400, {
          packageLegId: selection.packageLegId,
          departureDate,
          arrivalDate: selection.arrivalDate,
        })
      }
      if (
        selection.arrivalDate === departureDate &&
        selection.arrivalTime &&
        selection.departureTime &&
        selection.arrivalTime <= selection.departureTime
      ) {
        return jsonError("A flight arriving on its departure day must arrive after it departs", 400, {
          packageLegId: selection.packageLegId,
          departureTime: selection.departureTime,
          arrivalTime: selection.arrivalTime,
        })
      }
    }
  }

  // A hotel property's luggage-storage note is a fact about that property, so setting it on any
  // other supplier kind would be a stored value nothing reads — same reasoning as the flight
  // schedule guard above.
  for (const selection of parsed.data.selections) {
    if (selection.luggageStorageAvailable === undefined) continue
    const service = serviceById.get(selection.packageLegId)
    const supplier = Array.isArray(service?.suppliers) ? service.suppliers[0] : service?.suppliers
    const supplierKind = supplier?.kind
    if (supplierKind !== "hotel_property") {
      return jsonError("Luggage storage is only available on hotel services", 400, {
        packageLegId: selection.packageLegId,
        supplierKind,
      })
    }
  }

  // A supplier booking cannot be confirmed before it was placed. payment_made_date is left
  // unconstrained — prepayments happen. An omitted bookingDate means the stored value still
  // applies, same convention as the flight-date guard above.
  for (const selection of parsed.data.selections) {
    if (selection.confirmationDate === undefined) continue
    const service = serviceById.get(selection.packageLegId)
    const bookingDate =
      selection.bookingDate !== undefined ? selection.bookingDate : service?.booking_date ?? null
    if (selection.confirmationDate && bookingDate && selection.confirmationDate < bookingDate) {
      return jsonError("A supplier booking cannot be confirmed before it was placed.", 400, {
        packageLegId: selection.packageLegId,
        bookingDate,
        confirmationDate: selection.confirmationDate,
      })
    }
  }

  // Validate units up front (before any writes) — same rules as package-selections.
  const suiteTypeIds = parsed.data.selections.flatMap(
    (selection) => selection.units?.map((unit) => unit.suiteTypeId).filter((v): v is string => Boolean(v)) ?? [],
  )
  const allowedVariantsBySuiteType = await loadAllowedSuiteVariantIds(supabase, suiteTypeIds)

  for (const selection of parsed.data.selections) {
    if (!selection.units) continue
    const service = serviceById.get(selection.packageLegId)
    const supplier = Array.isArray(service?.suppliers) ? service.suppliers[0] : service?.suppliers
    const supplierKind = supplier?.kind

    if (supplierKind && TRANSPORT_SUPPLIER_KINDS.has(supplierKind)) {
      return jsonError(
        "Units are not supported for transfer/vehicle rental services — use transport requests instead",
        400,
        { packageLegId: selection.packageLegId },
      )
    }

    // The room-price override replaces a hotel's per-room-per-night rate card. Every other kind
    // prices per person (and manual-pricing kinds already have their own typed fares), so an
    // override there would silently mean something different from what was typed.
    if (
      supplierKind !== "hotel_property" &&
      selection.units.some((unit) => unit.manualRoomPrice !== null && unit.manualRoomPrice !== undefined)
    ) {
      return jsonError("A per-room price override is only available on hotel services", 400, {
        packageLegId: selection.packageLegId,
        supplierKind,
      })
    }

    // Same reasoning for the gifted first night: only a hotel stay is priced per night, so
    // dropping a night from anything else would quietly change what the line means.
    if (
      supplierKind !== "hotel_property" &&
      selection.units.some((unit) => unit.complimentaryFirstNight === true)
    ) {
      return jsonError("A complimentary first night is only available on hotel services", 400, {
        packageLegId: selection.packageLegId,
        supplierKind,
      })
    }

    // The tour price override replaces a tour unit's whole rate-card-computed total. Every other
    // passenger-split kind (trains, airlines) prices strictly per person off its own rate card or
    // typed fare, so an override there would silently mean something different from what was typed.
    if (
      supplierKind !== "tour_operator" &&
      selection.units.some((unit) => unit.manualTourPrice !== null && unit.manualTourPrice !== undefined)
    ) {
      return jsonError("A tour price override is only available on tour services", 400, {
        packageLegId: selection.packageLegId,
        supplierKind,
      })
    }

    // A per-unit rate type only means something for a tour: every other passenger-split kind
    // (trains, airlines) shares one rate type across the whole leg (see updateServiceSchema's
    // leg-level rateTypeId), so a unit-level one there would silently be ignored.
    if (
      supplierKind !== "tour_operator" &&
      selection.units.some((unit) => unit.rateTypeId !== null && unit.rateTypeId !== undefined)
    ) {
      return jsonError("A per-unit rate type is only available on tour services", 400, {
        packageLegId: selection.packageLegId,
        supplierKind,
      })
    }

    for (const [unitIndex, unit] of selection.units.entries()) {
      const suiteTypeId = unit.suiteTypeId
      if (!suiteTypeId) continue
      const invalidField = findInvalidVariantField({ ...unit, suiteTypeId }, allowedVariantsBySuiteType)
      if (invalidField) {
        return jsonError(`Unit ${unitIndex + 1}: ${invalidField} is not available for the selected suite type`, 400, {
          packageLegId: selection.packageLegId,
          unitIndex,
          field: invalidField,
        })
      }
    }

    if (supplierKind && PASSENGER_SUM_SUPPLIER_KINDS.has(supplierKind) && selection.units.length > 0) {
      const totals = await computeLegPassengerTotals(supabase, {
        noOfAdults: booking.no_of_adults,
        noOfChildren: booking.no_of_children,
        childAges: booking.child_ages ?? [],
        supplierId: service?.supplier_id ?? null,
      })
      const summed = selection.units.reduce(
        (acc, unit) => ({
          adultCount: acc.adultCount + unit.adultCount,
          childCount: acc.childCount + unit.childCount,
          infantCount: acc.infantCount + unit.infantCount,
        }),
        { adultCount: 0, childCount: 0, infantCount: 0 },
      )
      if (
        summed.adultCount !== totals.adultCount ||
        summed.childCount !== totals.childCount ||
        summed.infantCount !== totals.infantCount
      ) {
        return jsonError(
          "Per-unit passenger counts must sum to the booking's traveller totals for this service",
          400,
          { packageLegId: selection.packageLegId, expected: totals, received: summed },
        )
      }
    }
  }

  // Field updates. Issued concurrently rather than one awaited round trip per leg: each targets a
  // distinct row id, so there is no ordering between them. They can't be collapsed into a single
  // statement — every row sets a different subset of columns (the schema's `!== undefined` partial
  // update contract), which an upsert would flatten into "write every column".
  const fieldUpdates = parsed.data.selections.map((selection) => {
    const updatePayload: BookingServiceUpdate = {}
    if (selection.selected !== undefined) updatePayload.selected = selection.selected
    if (selection.routeId !== undefined) updatePayload.route_id = selection.routeId
    if (selection.routeReversed !== undefined) updatePayload.route_reversed = selection.routeReversed
    if (selection.serviceDate !== undefined) updatePayload.service_date = selection.serviceDate
    if (selection.nights !== undefined) updatePayload.nights = selection.nights
    if (selection.dateAnchor !== undefined) updatePayload.date_anchor = selection.dateAnchor
    if (selection.rateTypeId !== undefined) updatePayload.rate_type_id = selection.rateTypeId
    if (selection.notes !== undefined) updatePayload.notes = selection.notes
    if (selection.priceCurrency !== undefined) updatePayload.price_currency = selection.priceCurrency
    if (selection.departureTime !== undefined) updatePayload.departure_time = selection.departureTime
    if (selection.arrivalDate !== undefined) updatePayload.arrival_date = selection.arrivalDate
    if (selection.arrivalTime !== undefined) updatePayload.arrival_time = selection.arrivalTime
    if (selection.flightNumber !== undefined) updatePayload.flight_number = selection.flightNumber
    if (selection.departureAirportCode !== undefined) {
      updatePayload.departure_airport_code = selection.departureAirportCode
    }
    if (selection.arrivalAirportCode !== undefined) {
      updatePayload.arrival_airport_code = selection.arrivalAirportCode
    }
    if (selection.handLuggageKg !== undefined) updatePayload.hand_luggage_kg = selection.handLuggageKg
    if (selection.checkedLuggageKg !== undefined) updatePayload.checked_luggage_kg = selection.checkedLuggageKg
    if (selection.luggageStorageAvailable !== undefined) {
      updatePayload.luggage_storage_available = selection.luggageStorageAvailable
    }
    if (selection.bookingDate !== undefined) updatePayload.booking_date = selection.bookingDate
    if (selection.confirmationDate !== undefined) updatePayload.confirmation_date = selection.confirmationDate
    if (selection.paymentMadeDate !== undefined) updatePayload.payment_made_date = selection.paymentMadeDate
    if (selection.paidWith !== undefined) updatePayload.paid_with = selection.paidWith

    // Origin flips to 'consultant' the moment a human writes to this row, mirroring the
    // FieldFlags/editedAxes convention: an auto-filled value stops being auto-filled on edit.
    updatePayload.origin = "consultant"

    return supabase
      .from("booking_services")
      .update(updatePayload)
      .eq("booking_id", id)
      .eq("id", selection.packageLegId)
  })

  const updateResults = await Promise.all(fieldUpdates)
  const firstUpdateError = updateResults.find((result) => result.error)?.error
  if (firstUpdateError) return safeSupabaseError("services:update", firstUpdateError)

  // Per-service unit replacement (full replace-set, only for services whose payload includes units).
  const servicesWithUnits = parsed.data.selections.filter((selection) => selection.units)

  // Units are replaced wholesale, so the override's "who and when" has to be carried across the
  // delete/insert by hand: an unchanged amount keeps its original stamp, a changed or brand-new
  // one is stamped with this save. Without this, re-saving a leg for an unrelated reason would
  // keep re-dating an override nobody touched.
  const existingUnitProvenance = new Map<string, { price: number | null; setAt: string | null; setBy: string | null }>()
  const existingTourProvenance = new Map<string, { price: number | null; setAt: string | null; setBy: string | null }>()
  if (servicesWithUnits.length > 0) {
    const { data: existingUnits, error: existingUnitsError } = await supabase
      .from("booking_service_units")
      .select(
        "id, manual_room_price, manual_room_price_set_at, manual_room_price_set_by, manual_tour_price, manual_tour_price_set_at, manual_tour_price_set_by",
      )
      .in(
        "service_id",
        servicesWithUnits.map((selection) => selection.packageLegId),
      )

    if (existingUnitsError) return safeSupabaseError("services:load-units", existingUnitsError)

    for (const unit of existingUnits ?? []) {
      existingUnitProvenance.set(unit.id, {
        price: unit.manual_room_price,
        setAt: unit.manual_room_price_set_at,
        setBy: unit.manual_room_price_set_by,
      })
      existingTourProvenance.set(unit.id, {
        price: unit.manual_tour_price,
        setAt: unit.manual_tour_price_set_at,
        setBy: unit.manual_tour_price_set_by,
      })
    }
  }

  const savedAt = new Date().toISOString()

  // One delete + one insert across every service in the payload, rather than a pair per service.
  // The replace-set semantics are unchanged: the delete covers exactly the services whose payload
  // carries units, which is the same set the per-service loop used to clear.
  if (servicesWithUnits.length > 0) {
    const { error: deleteUnitsError } = await supabase
      .from("booking_service_units")
      .delete()
      .in(
        "service_id",
        servicesWithUnits.map((selection) => selection.packageLegId),
      )

    if (deleteUnitsError) return safeSupabaseError("services:clear-units", deleteUnitsError)
  }

  const unitRows: BookingServiceUnitInsert[] = servicesWithUnits.flatMap((selection) =>
    (selection.units ?? []).map((unit, index) => {
      const roomPrice = unit.manualRoomPrice ?? null
      const previous = unit.id ? existingUnitProvenance.get(unit.id) : undefined
      const unchanged = roomPrice !== null && previous?.price === roomPrice
      const tourPrice = unit.manualTourPrice ?? null
      const previousTour = unit.id ? existingTourProvenance.get(unit.id) : undefined
      const tourUnchanged = tourPrice !== null && previousTour?.price === tourPrice
      return {
        service_id: selection.packageLegId,
        suite_type_id: unit.suiteTypeId,
        bedroom_type_id: unit.bedroomTypeId ?? null,
        bedroom_layout_id: unit.bedroomLayoutId ?? null,
        bathroom_type_id: unit.bathroomTypeId ?? null,
        adult_count: unit.adultCount,
        child_count: unit.childCount,
        infant_count: unit.infantCount,
        sort_order: unit.sortOrder ?? index,
        manual_adult_price: unit.manualAdultPrice ?? null,
        manual_child_price: unit.manualChildPrice ?? null,
        manual_infant_price: unit.manualInfantPrice ?? null,
        manual_room_price: roomPrice,
        complimentary_first_night: unit.complimentaryFirstNight ?? false,
        manual_room_price_set_at: roomPrice === null ? null : unchanged ? previous?.setAt ?? savedAt : savedAt,
        manual_room_price_set_by: roomPrice === null ? null : unchanged ? previous?.setBy ?? user.id : user.id,
        manual_tour_price: tourPrice,
        manual_tour_price_set_at:
          tourPrice === null ? null : tourUnchanged ? previousTour?.setAt ?? savedAt : savedAt,
        manual_tour_price_set_by:
          tourPrice === null ? null : tourUnchanged ? previousTour?.setBy ?? user.id : user.id,
        rate_type_id: unit.rateTypeId ?? null,
        origin: "consultant" as const,
      }
    }),
  )

  if (unitRows.length > 0) {
    const { error: insertUnitsError } = await supabase.from("booking_service_units").insert(unitRows)
    if (insertUnitsError) return safeSupabaseError("services:insert-units", insertUnitsError)
  }

  // Learn from the correction — the higher-traffic correction point, same alias store as the
  // import review modal. Best-effort: a failed alias write must never fail the update.
  //
  // Deliberately the SERVICE client, not the session one: suite_vocab_aliases has RLS on with no
  // INSERT/UPDATE policy for `authenticated` (by design — see the migration), so every learning
  // write made with the session client was silently rejected by RLS and the store swallowed it.
  // The user is already authorised for this booking above; this write is a system consequence of
  // that, not a user-scoped one.
  // Scheduled after the response is sent, not awaited on the request: the result is discarded
  // either way (best-effort per the doc comment above), so there is no reason the consultant's
  // save should wait on it.
  if (servicesWithUnits.length > 0) {
    const unitsToLearn = servicesWithUnits.flatMap((selection) => selection.units ?? [])
    const learn = async () => {
      try {
        await learnSuiteAliasesFromUnits(createServiceClient(), id, unitsToLearn, user.id)
      } catch (error) {
        console.error("services:suiteAliasLearning", error)
      }
    }
    try {
      after(learn)
    } catch {
      // after() needs Next's request-scope context, which only exists when this handler is
      // invoked through the real Next server -- a unit test calling PATCH directly doesn't set
      // that up, and after() throws synchronously outside it. Fire the write without the
      // keep-alive guarantee in that case; it's still best-effort, and no test asserts on it.
      void learn()
    }
  }

  if (!parsed.data.deferTripDateRecompute) {
    const recompute = await recomputeBookingTripDates(supabase, id)
    if (recompute.error) return jsonError(recompute.error, 500)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_services_updated",
    meta: { service_ids: serviceIds },
  })

  const { data: services, error: reloadError } = await supabase
    .from("booking_services")
    .select(SERVICES_WITH_UNITS_SELECT)
    .eq("booking_id", id)

  if (reloadError) return safeSupabaseError("services:reload", reloadError)

  const reloadedRows = (services ?? []) as unknown as ServiceWithUnitsRow[]
  return Response.json({ selections: reloadedRows.map((row) => ({ ...row, package_leg_id: row.id })) })
}
