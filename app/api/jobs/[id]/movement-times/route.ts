import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { loadMovementTimeRows, type MovementTimeRow } from "@/lib/booking-times/movement-rows"
import { recomputeBookingTripDates } from "@/lib/packages/recompute-trip-dates"
import { resolveAcceptedQuoteScope, scopeLegIdsFilter } from "@/lib/quotes/accepted-quote-scope"
import type { Database } from "@/lib/supabase/types"

export const runtime = "nodejs"

/**
 * Re-times the movements on a booking — flight departures and arrivals, transfer pickups, rental
 * returns — after the quote is done.
 *
 * Deliberately touches neither `quotes` nor `quote_line_items`, so an accepted quote's lock
 * (LOCKED_QUOTE_STATUSES in app/api/quotes/[id]/route.ts) is never on this path, and no new quote
 * version is created. That is not a loophole: a flight reschedule changes *when* a service happens,
 * not *what was sold*. The leg id a quote line snapshots is unchanged, the fare is unchanged, and
 * the quote's leg scope still resolves to the same set. Do not "fix" this by adding a lock — the
 * whole point is that a 45-minute schedule shift on a paid booking must not need a quote revision.
 *
 * It also sends no `expectedUpdatedAt`, so the Build Booking dialog's STALE_VERSION 409 is not on
 * this path either: this is a narrow per-row edit, not a whole-leg replace.
 */

interface RouteParams {
  params: Promise<{ id: string }>
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

const nullableDate = z.string().regex(datePattern, "Expected YYYY-MM-DD").nullable()
const nullableTime = z.string().regex(timePattern, "Expected HH:MM").nullable()

const airportCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3,4}$/, "Expected a 3- or 4-letter airport code")
  .transform((code) => code.toUpperCase())
  .nullable()

/** A flight leg: wall-clock date + time columns on booking_services, no timezone applied. */
const serviceUpdateSchema = z.object({
  kind: z.literal("service"),
  id: z.string().uuid(),
  departureDate: nullableDate.optional(),
  departureTime: nullableTime.optional(),
  arrivalDate: nullableDate.optional(),
  arrivalTime: nullableTime.optional(),
  flightNumber: z.string().trim().min(2).max(20).nullable().optional(),
  departureAirportCode: airportCode.optional(),
  arrivalAirportCode: airportCode.optional(),
  handLuggageKg: z.number().nonnegative().nullable().optional(),
  checkedLuggageKg: z.number().nonnegative().nullable().optional(),
})

/** A transfer/rental: pickup_at and return_at are real instants, so the client sends full ISO
 * timestamps exactly as the transport leg editor already does. */
const transportUpdateSchema = z.object({
  kind: z.literal("transport_request"),
  id: z.string().uuid(),
  pickupAt: z.string().datetime({ offset: true }).nullable().optional(),
  returnAt: z.string().datetime({ offset: true }).nullable().optional(),
})

const updateSchema = z.object({
  updates: z
    .array(z.discriminatedUnion("kind", [serviceUpdateSchema, transportUpdateSchema]))
    .min(1, "At least one update is required"),
})

type ServiceUpdate = z.infer<typeof serviceUpdateSchema>

interface VoucherFreshness {
  generatedAt: string | null
  sentAt: string | null
  /** A voucher exists and a movement has been re-timed since it was produced, so the document on
   * file no longer matches the booking. Voucher blocks are snapshotted at generation time
   * (app/api/voucher/generate/route.ts), which is correct — but it means nothing tells anyone the
   * copy in the client's inbox is now wrong unless we say so. */
  stale: boolean
}

async function loadVoucherFreshness(
  supabase: SupabaseClient<Database>,
  bookingId: string,
  rows: MovementTimeRow[],
): Promise<VoucherFreshness> {
  const { data } = await supabase
    .from("vouchers")
    .select("generated_at, sent_at")
    .eq("booking_id", bookingId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const generatedAt = data?.generated_at ?? null
  const sentAt = data?.sent_at ?? null
  if (!generatedAt) return { generatedAt: null, sentAt, stale: false }

  const lastEdit = rows.reduce<string | null>((latest, row) => {
    if (!row.updatedAt) return latest
    return !latest || row.updatedAt > latest ? row.updatedAt : latest
  }, null)

  return {
    generatedAt,
    sentAt,
    stale: Boolean(lastEdit) && Date.parse(lastEdit as string) > Date.parse(generatedAt),
  }
}

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  try {
    // Scoped to what the accepted quote priced, so the tab never lists a movement the customer
    // did not buy — same rule as the Voucher Details tab.
    const quoteScope = await resolveAcceptedQuoteScope(supabase, id)
    const rows = await loadMovementTimeRows(supabase, id, { legIds: scopeLegIdsFilter(quoteScope) })
    const voucher = await loadVoucherFreshness(supabase, id, rows)
    return Response.json({ rows, voucher })
  } catch (error) {
    return safeSupabaseError("movement-times:list", error)
  }
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

  const parsed = updateSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const serviceUpdates = parsed.data.updates.filter(
    (update): update is ServiceUpdate => update.kind === "service",
  )

  // Every targeted service must belong to this booking AND be a flight: the flight columns mean
  // nothing on a hotel or train leg, and a train's schedule lives on its route by design.
  const serviceById = new Map<string, { service_date: string | null }>()
  if (serviceUpdates.length > 0) {
    const { data: services, error: servicesError } = await supabase
      .from("booking_services")
      .select("id, service_date, suppliers(kind)")
      .eq("booking_id", id)
      .in(
        "id",
        serviceUpdates.map((update) => update.id),
      )

    if (servicesError) return safeSupabaseError("movement-times:load-services", servicesError)

    for (const row of services ?? []) {
      const supplier = Array.isArray(row.suppliers) ? row.suppliers[0] : row.suppliers
      if (supplier?.kind !== "airline") {
        return jsonError("Flight times are only available on airline services", 400, {
          serviceId: row.id,
          supplierKind: supplier?.kind ?? null,
        })
      }
      serviceById.set(row.id, { service_date: row.service_date })
    }

    const unknown = serviceUpdates.filter((update) => !serviceById.has(update.id))
    if (unknown.length > 0) {
      return jsonError("Updates reference services outside this booking", 400, {
        invalidServiceIds: unknown.map((update) => update.id),
      })
    }
  }

  for (const update of parsed.data.updates) {
    if (update.kind === "service") {
      const stored = serviceById.get(update.id)
      const departureDate =
        update.departureDate !== undefined ? update.departureDate : stored?.service_date ?? null

      // The DB refuses an arrival before the departure day. A same-day arrival at or before the
      // departure time needs both fields together, so it is checked here.
      if (update.arrivalDate && departureDate) {
        if (update.arrivalDate < departureDate) {
          return jsonError("A flight cannot arrive before it departs", 400, { serviceId: update.id })
        }
        if (
          update.arrivalDate === departureDate &&
          update.arrivalTime &&
          update.departureTime &&
          update.arrivalTime <= update.departureTime
        ) {
          return jsonError("A flight arriving on its departure day must arrive after it departs", 400, {
            serviceId: update.id,
          })
        }
      }

      const payload: Record<string, unknown> = {}
      if (update.departureDate !== undefined) payload.service_date = update.departureDate
      if (update.departureTime !== undefined) payload.departure_time = update.departureTime
      if (update.arrivalDate !== undefined) payload.arrival_date = update.arrivalDate
      if (update.arrivalTime !== undefined) payload.arrival_time = update.arrivalTime
      if (update.flightNumber !== undefined) payload.flight_number = update.flightNumber
      if (update.departureAirportCode !== undefined) {
        payload.departure_airport_code = update.departureAirportCode
      }
      if (update.arrivalAirportCode !== undefined) {
        payload.arrival_airport_code = update.arrivalAirportCode
      }
      if (update.handLuggageKg !== undefined) payload.hand_luggage_kg = update.handLuggageKg
      if (update.checkedLuggageKg !== undefined) payload.checked_luggage_kg = update.checkedLuggageKg
      if (Object.keys(payload).length === 0) continue

      const { error } = await supabase
        .from("booking_services")
        .update(payload)
        .eq("booking_id", id)
        .eq("id", update.id)

      if (error) return safeSupabaseError("movement-times:update-service", error)
      continue
    }

    if (update.pickupAt !== undefined) {
      // A pickup typed here is a deliberate override, so it must stick — flip the anchor to
      // 'custom' or the next Build Booking re-derive (lib/packages/transfer-dates.ts) would
      // silently overwrite what was just typed. Scoped on booking_id as well as id so a request
      // from another booking can never be reached.
      const { error } = await supabase
        .from("booking_transport_requests")
        .update({ pickup_at: update.pickupAt, date_anchor: "custom" })
        .eq("booking_id", id)
        .eq("id", update.id)

      if (error) return safeSupabaseError("movement-times:update-transport", error)
    }

    if (update.returnAt !== undefined) {
      // Rental returns live on their own detail row, which only exists for a rental. Updating by
      // transport_request_id leaves a transfer untouched rather than inventing a row for it.
      const { error } = await supabase
        .from("booking_vehicle_rental_details")
        .update({ return_at: update.returnAt })
        .eq("transport_request_id", update.id)

      if (error) return safeSupabaseError("movement-times:update-rental", error)
    }
  }

  // An overnight flight or a moved rental return can push the trip's own end date out.
  const recompute = await recomputeBookingTripDates(supabase, id)
  if (recompute.error) return jsonError(recompute.error, 500)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "movement_times_updated",
    meta: { updates: parsed.data.updates },
  })

  try {
    const quoteScope = await resolveAcceptedQuoteScope(supabase, id)
    const rows = await loadMovementTimeRows(supabase, id, { legIds: scopeLegIdsFilter(quoteScope) })
    const voucher = await loadVoucherFreshness(supabase, id, rows)
    return Response.json({ rows, voucher })
  } catch (error) {
    return safeSupabaseError("movement-times:reload", error)
  }
}
