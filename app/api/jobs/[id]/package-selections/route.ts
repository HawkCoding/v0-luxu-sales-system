import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadAllowedSuiteVariantIds, findInvalidVariantField } from "@/lib/packages/suite-config"
import { computeLegPassengerTotals } from "@/lib/packages/passenger-totals"
import { recomputeBookingTripDates } from "@/lib/packages/recompute-trip-dates"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

const datePattern = /^\d{4}-\d{2}-\d{2}$/

/** Legs whose passenger totals are booking-level splits (adult/child/infant sub-lines) rather
 * than a fixed room×night count — units on these legs must carry a passenger split that sums to
 * the booking's totals. Hotel legs get units too, but pricing is per room×night, not per pax. */
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
})

const updateSelectionSchema = z.object({
  packageLegId: z.string().uuid(),
  selected: z.boolean().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  routeId: z.string().uuid().nullable().optional(),
  serviceDate: z
    .string()
    .regex(datePattern, "Expected YYYY-MM-DD")
    .nullable()
    .optional(),
  nights: z.number().int().positive().nullable().optional(),
  dateAnchor: z.enum(["pre", "post", "custom"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  units: z.array(selectionUnitSchema).optional(),
})

const patchSelectionsSchema = z.object({
  selections: z.array(updateSelectionSchema).min(1, "At least one selection is required"),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

type BookingPackageSelectionUpdate =
  Database["public"]["Tables"]["booking_package_selections"]["Update"]
type BookingPackageSelectionUnitInsert =
  Database["public"]["Tables"]["booking_package_selection_units"]["Insert"]

const SELECTIONS_WITH_UNITS_SELECT =
  "id, booking_id, package_leg_id, selected, supplier_id, route_id, suite_type_id, service_date, nights, date_anchor, notes, " +
  "units:booking_package_selection_units(id, suite_type_id, bedroom_type_id, bedroom_layout_id, bathroom_type_id, adult_count, child_count, infant_count, sort_order)"

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

  const parsed = patchSelectionsSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, package_id, no_of_adults, no_of_children, child_ages")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("package-selections:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)
  if (!booking.package_id) return jsonError("Booking has no package assigned", 400)

  const legIds = parsed.data.selections.map((selection) => selection.packageLegId)
  const { data: validLegs, error: legsError } = await supabase
    .from("package_legs")
    .select("id, supplier_id, supplier:suppliers(kind)")
    .eq("package_id", booking.package_id)
    .in("id", legIds)

  if (legsError) return safeSupabaseError("package-selections:load-legs", legsError)

  const legById = new Map((validLegs ?? []).map((leg) => [leg.id, leg]))
  const invalid = legIds.filter((legId) => !legById.has(legId))
  if (invalid.length > 0) {
    return jsonError("Selections reference legs outside the assigned package", 400, {
      invalidLegIds: invalid,
    })
  }

  // Validate units up front (before any writes): reject units on transfer/rental legs, reject
  // bedroom/layout/bathroom combinations that aren't associated with the chosen suite type, and
  // require per-unit passenger splits to sum to the booking's totals on train/tour/airline legs.
  const suiteTypeIds = parsed.data.selections.flatMap(
    (selection) => selection.units?.map((unit) => unit.suiteTypeId).filter((v): v is string => Boolean(v)) ?? [],
  )
  const allowedVariantsBySuiteType = await loadAllowedSuiteVariantIds(supabase, suiteTypeIds)

  for (const selection of parsed.data.selections) {
    if (!selection.units) continue
    const leg = legById.get(selection.packageLegId)
    const supplierKind = leg?.supplier?.kind

    if (supplierKind && TRANSPORT_SUPPLIER_KINDS.has(supplierKind)) {
      return jsonError(
        "Units are not supported for transfer/vehicle rental legs — use transport requests instead",
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
        supplierId: leg?.supplier_id ?? null,
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
          "Per-unit passenger counts must sum to the booking's traveller totals for this leg",
          400,
          { packageLegId: selection.packageLegId, expected: totals, received: summed },
        )
      }
    }
  }

  // Leg-level field updates (unchanged shape/semantics).
  for (const selection of parsed.data.selections) {
    const updatePayload: BookingPackageSelectionUpdate = {}
    if (selection.selected !== undefined) updatePayload.selected = selection.selected
    if (selection.supplierId !== undefined) updatePayload.supplier_id = selection.supplierId
    if (selection.routeId !== undefined) updatePayload.route_id = selection.routeId
    if (selection.serviceDate !== undefined) updatePayload.service_date = selection.serviceDate
    if (selection.nights !== undefined) updatePayload.nights = selection.nights
    if (selection.dateAnchor !== undefined) updatePayload.date_anchor = selection.dateAnchor
    if (selection.notes !== undefined) updatePayload.notes = selection.notes

    if (Object.keys(updatePayload).length === 0) continue

    const { error: updateError } = await supabase
      .from("booking_package_selections")
      .update(updatePayload)
      .eq("booking_id", id)
      .eq("package_leg_id", selection.packageLegId)

    if (updateError) {
      return safeSupabaseError("package-selections:update", updateError)
    }
  }

  // Per-leg unit replacement (full replace-set per leg, only for legs whose payload includes units).
  const legsWithUnits = parsed.data.selections.filter((selection) => selection.units)
  if (legsWithUnits.length > 0) {
    const { data: selectionRows, error: selectionRowsError } = await supabase
      .from("booking_package_selections")
      .select("id, package_leg_id")
      .eq("booking_id", id)
      .in(
        "package_leg_id",
        legsWithUnits.map((selection) => selection.packageLegId),
      )

    if (selectionRowsError) return safeSupabaseError("package-selections:load-selection-ids", selectionRowsError)

    const selectionIdByLegId = new Map((selectionRows ?? []).map((row) => [row.package_leg_id, row.id]))

    for (const selection of legsWithUnits) {
      const selectionId = selectionIdByLegId.get(selection.packageLegId)
      if (!selectionId) continue

      const { error: deleteUnitsError } = await supabase
        .from("booking_package_selection_units")
        .delete()
        .eq("selection_id", selectionId)

      if (deleteUnitsError) return safeSupabaseError("package-selections:clear-units", deleteUnitsError)

      const unitRows: BookingPackageSelectionUnitInsert[] = (selection.units ?? []).map((unit, index) => ({
        selection_id: selectionId,
        suite_type_id: unit.suiteTypeId,
        bedroom_type_id: unit.bedroomTypeId ?? null,
        bedroom_layout_id: unit.bedroomLayoutId ?? null,
        bathroom_type_id: unit.bathroomTypeId ?? null,
        adult_count: unit.adultCount,
        child_count: unit.childCount,
        infant_count: unit.infantCount,
        sort_order: unit.sortOrder ?? index,
      }))

      if (unitRows.length > 0) {
        const { error: insertUnitsError } = await supabase
          .from("booking_package_selection_units")
          .insert(unitRows)

        if (insertUnitsError) return safeSupabaseError("package-selections:insert-units", insertUnitsError)
      }
    }
  }

  // Trip dates are derived from the services, so any selection change re-dates the trip.
  const recompute = await recomputeBookingTripDates(supabase, id)
  if (recompute.error) return jsonError(recompute.error, 500)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "booking_package_selections_updated",
    meta: { leg_ids: legIds },
  })

  const { data: selections, error: reloadError } = await supabase
    .from("booking_package_selections")
    .select(SELECTIONS_WITH_UNITS_SELECT)
    .eq("booking_id", id)

  if (reloadError) return safeSupabaseError("package-selections:reload", reloadError)

  return Response.json({ selections: selections ?? [] })
}
