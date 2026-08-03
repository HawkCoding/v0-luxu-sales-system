import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadAllowedSuiteVariantIds, findInvalidVariantField } from "@/lib/packages/suite-config"
import { computeLegPassengerTotals } from "@/lib/packages/passenger-totals"
import { recomputeBookingTripDates } from "@/lib/packages/recompute-trip-dates"
import { learnSuiteAliasesFromUnits } from "@/lib/suites/learn-from-units"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

/**
 * Build Booking's equivalent of PATCH /api/jobs/[id]/package-selections, operating on
 * booking_services/booking_service_units instead of booking_package_selections/_units. A
 * booking_services row already is the leg and the selection collapsed into one (see
 * supabase/migrations/20260729100000_booking_services.sql), so there is no separate
 * package_leg_id lookup step here — the request's "packageLegId" field is the booking_services
 * row's own id. The field name is kept identical to the catalogue endpoint's request/response
 * shape so lib/packages/apply-dialog-state.ts's converters (toPackageSelectionsPatch,
 * hydrateFromSaved, SavedPackageState) are shared unmodified between both flows.
 */

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const PASSENGER_SPLIT_SUPPLIER_KINDS = new Set(["train_operator", "tour_operator", "airline"])
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
})

const updateServiceSchema = z.object({
  packageLegId: z.string().uuid(),
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
  dateAnchor: z.enum(["pre", "post", "custom"]).nullable().optional(),
  rateTypeId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  units: z.array(selectionUnitSchema).optional(),
})

const patchServicesSchema = z.object({
  selections: z.array(updateServiceSchema).min(1, "At least one selection is required"),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

type BookingServiceUpdate = Database["public"]["Tables"]["booking_services"]["Update"]
type BookingServiceUnitInsert = Database["public"]["Tables"]["booking_service_units"]["Insert"]

const SERVICES_WITH_UNITS_SELECT =
  "id, booking_id, supplier_id, route_id, route_reversed, suite_type_id, service_date, nights, date_anchor, rate_type_id, notes, selected, origin, " +
  "units:booking_service_units(id, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id, adult_count, child_count, infant_count, sort_order, manual_adult_price, manual_child_price, manual_infant_price)"

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
  selected: boolean
  origin: "auto" | "consultant"
  units: ServiceUnitRow[]
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
    .select("id, trip_start_date, trip_end_date")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services:get-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: services, error: servicesError } = await supabase
    .from("booking_services")
    .select(SERVICES_WITH_UNITS_SELECT)
    .eq("booking_id", id)

  if (servicesError) return safeSupabaseError("services:get-services", servicesError)

  const serviceRows = (services ?? []) as unknown as ServiceWithUnitsRow[]

  return Response.json({
    // No catalogue package concept here; the presence of service rows is the signal instead.
    packageId: serviceRows.length > 0 ? id : null,
    tripStartDate: booking.trip_start_date,
    tripEndDate: booking.trip_end_date,
    selections: serviceRows.map((row) => ({ ...row, package_leg_id: row.id })),
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
    .select("id, no_of_adults, no_of_children, child_ages")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("services:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const serviceIds = parsed.data.selections.map((selection) => selection.packageLegId)
  const { data: validServices, error: servicesLoadError } = await supabase
    .from("booking_services")
    .select("id, supplier_id, suppliers(kind)")
    .eq("booking_id", id)
    .in("id", serviceIds)

  if (servicesLoadError) return safeSupabaseError("services:load-services", servicesLoadError)

  const serviceById = new Map((validServices ?? []).map((row) => [row.id, row]))
  const invalid = serviceIds.filter((serviceId) => !serviceById.has(serviceId))
  if (invalid.length > 0) {
    return jsonError("Selections reference services outside this booking", 400, { invalidServiceIds: invalid })
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

    if (supplierKind && PASSENGER_SPLIT_SUPPLIER_KINDS.has(supplierKind) && selection.units.length > 0) {
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

  // Field updates.
  for (const selection of parsed.data.selections) {
    const updatePayload: BookingServiceUpdate = {}
    if (selection.selected !== undefined) updatePayload.selected = selection.selected
    if (selection.routeId !== undefined) updatePayload.route_id = selection.routeId
    if (selection.routeReversed !== undefined) updatePayload.route_reversed = selection.routeReversed
    if (selection.serviceDate !== undefined) updatePayload.service_date = selection.serviceDate
    if (selection.nights !== undefined) updatePayload.nights = selection.nights
    if (selection.dateAnchor !== undefined) updatePayload.date_anchor = selection.dateAnchor
    if (selection.rateTypeId !== undefined) updatePayload.rate_type_id = selection.rateTypeId
    if (selection.notes !== undefined) updatePayload.notes = selection.notes

    // Origin flips to 'consultant' the moment a human writes to this row, mirroring the
    // FieldFlags/editedAxes convention: an auto-filled value stops being auto-filled on edit.
    updatePayload.origin = "consultant"

    const { error: updateError } = await supabase
      .from("booking_services")
      .update(updatePayload)
      .eq("booking_id", id)
      .eq("id", selection.packageLegId)

    if (updateError) return safeSupabaseError("services:update", updateError)
  }

  // Per-service unit replacement (full replace-set, only for services whose payload includes units).
  const servicesWithUnits = parsed.data.selections.filter((selection) => selection.units)
  for (const selection of servicesWithUnits) {
    const { error: deleteUnitsError } = await supabase
      .from("booking_service_units")
      .delete()
      .eq("service_id", selection.packageLegId)

    if (deleteUnitsError) return safeSupabaseError("services:clear-units", deleteUnitsError)

    const unitRows: BookingServiceUnitInsert[] = (selection.units ?? []).map((unit, index) => ({
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
      origin: "consultant",
    }))

    if (unitRows.length > 0) {
      const { error: insertUnitsError } = await supabase.from("booking_service_units").insert(unitRows)
      if (insertUnitsError) return safeSupabaseError("services:insert-units", insertUnitsError)
    }
  }

  // Learn from the correction — the higher-traffic correction point, same alias store as the
  // import review modal. Best-effort: a failed alias write must never fail the update.
  if (servicesWithUnits.length > 0) {
    try {
      await learnSuiteAliasesFromUnits(
        supabase,
        id,
        servicesWithUnits.flatMap((selection) => selection.units ?? []),
        user.id,
      )
    } catch (error) {
      console.error("services:suiteAliasLearning", error)
    }
  }

  const recompute = await recomputeBookingTripDates(supabase, id)
  if (recompute.error) return jsonError(recompute.error, 500)

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
