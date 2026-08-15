import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { normalizeDateOfBirth } from "@/lib/date-format"
import { compareRosterToBooking, type RosterComparison } from "@/lib/packages/roster-pax"
import { fetchDefaultAgeBuckets } from "@/lib/pricing/age-buckets"
import { TRAVELLER_COLUMNS } from "@/lib/supabase/columns"
import type { createSessionClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/types"

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

const travellerInputSchema = z.object({
  id: z.string().uuid().optional(),
  prefix: z.string().trim().max(20).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  idPassport: z.string().trim().min(1, "ID/passport number is required").max(50),
  dateOfBirth: z.string().trim().max(50).nullable().optional(),
  residence: z.string().trim().max(100).nullable().optional(),
  roomWith: z.string().trim().max(200).nullable().optional(),
  roomType: z.string().trim().max(100).nullable().optional(),
  isChild: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
})

const putTravellersSchema = z.object({
  travellers: z.array(travellerInputSchema).max(50),
})

type TravellerRow = {
  id: string
  booking_id: string
  prefix: string | null
  first_name: string
  last_name: string
  id_passport: string | null
  date_of_birth: string | null
  residence: string | null
  room_with: string | null
  room_type: string | null
  is_child: boolean
  is_primary: boolean
  sort_order: number
}

/**
 * Copies the primary guest's ID/passport and date of birth onto the linked
 * customer record so the CRM profile can prefill future bookings. Guest data
 * wins; blank guest fields never wipe an existing customer value. Best-effort —
 * a failure here must not fail the guest save.
 */
async function syncPrimaryGuestToCustomer(
  supabase: SessionClient,
  customerId: string | null,
  primary: { idPassport: string; dateOfBirth?: string | null } | undefined,
): Promise<void> {
  if (!customerId || !primary) return

  const idPassport = primary.idPassport.trim()
  const dateOfBirth = normalizeDateOfBirth(primary.dateOfBirth)

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, date_of_birth, id_passport")
    .eq("id", customerId)
    .maybeSingle()

  if (error || !customer) return

  const updates: Database["public"]["Tables"]["customers"]["Update"] = {}
  if (idPassport && idPassport !== (customer.id_passport ?? "")) {
    updates.id_passport = idPassport
  }
  // customers.date_of_birth is a DATE column while travellers.date_of_birth is
  // free text, so only sync values Postgres will accept. normalizeDateOfBirth
  // returns null for anything it can't read confidently.
  if (dateOfBirth && dateOfBirth !== (customer.date_of_birth ?? "")) {
    updates.date_of_birth = dateOfBirth
  }

  if (Object.keys(updates).length === 0) return

  await supabase.from("customers").update(updates).eq("id", customerId)
}

function mapTraveller(row: TravellerRow) {
  return {
    id: row.id,
    prefix: row.prefix ?? "",
    firstName: row.first_name,
    lastName: row.last_name,
    idPassport: row.id_passport ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    residence: row.residence ?? "",
    roomWith: row.room_with ?? "",
    roomType: row.room_type ?? "",
    isChild: row.is_child,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
  }
}

/**
 * The roster and the pax the booking is priced from are captured separately and never reconciled
 * automatically, so every read of the roster carries the comparison with it — that is the only
 * thing standing between a child captured as a guest and an invoice priced for two adults.
 * Guests are aged at the trip start (falling back to the departure date, then today).
 */
async function loadPaxComparison(
  supabase: SessionClient,
  bookingId: string,
  travellers: { dateOfBirth?: string | null; isChild?: boolean }[],
): Promise<RosterComparison | null> {
  const { data: booking } = await supabase
    .from("bookings")
    .select("no_of_adults, no_of_children, child_ages, trip_start_date, departure_date")
    .eq("id", bookingId)
    .maybeSingle()

  if (!booking) return null

  const buckets = await fetchDefaultAgeBuckets(supabase)
  const referenceDate =
    booking.trip_start_date ?? booking.departure_date ?? new Date().toISOString().slice(0, 10)

  return compareRosterToBooking(
    travellers,
    {
      noOfAdults: booking.no_of_adults,
      noOfChildren: booking.no_of_children,
      childAges: booking.child_ages ?? [],
    },
    buckets,
    referenceDate,
  )
}

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data, error } = await supabase
    .from("travellers")
    .select(TRAVELLER_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order")

  if (error) return safeSupabaseError("travellers:list", error)

  const travellers = (data ?? []).map((row) => mapTraveller(row as TravellerRow))

  return Response.json({
    travellers,
    paxComparison: await loadPaxComparison(supabase, id, travellers),
  })
}

export async function PUT(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = putTravellersSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, customer_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("travellers:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  type TravellerInsert = Database["public"]["Tables"]["travellers"]["Insert"]
  const rows: TravellerInsert[] = parsed.data.travellers.map((traveller, index) => ({
    booking_id: id,
    prefix: traveller.prefix?.trim() || null,
    first_name: traveller.firstName.trim(),
    last_name: traveller.lastName.trim(),
    id_passport: traveller.idPassport?.trim() || null,
    // Store ISO where we can read the input, so the value round-trips to the
    // customer profile. Unreadable input is kept verbatim rather than dropped.
    date_of_birth: normalizeDateOfBirth(traveller.dateOfBirth) ?? (traveller.dateOfBirth?.trim() || null),
    residence: traveller.residence?.trim() || null,
    room_with: traveller.roomWith?.trim() || null,
    room_type: traveller.roomType?.trim() || null,
    is_child: traveller.isChild,
    is_primary: traveller.isPrimary,
    sort_order: index,
  }))

  // Replace-set semantics: the delete is unconditional. Count what goes so an empty payload can
  // report the wipe rather than returning a silent 200 (guest IDs and DOBs are unrecoverable).
  const { data: cleared, error: deleteError } = await supabase
    .from("travellers")
    .delete()
    .eq("booking_id", id)
    .select("id")
  if (deleteError) return safeSupabaseError("travellers:clear", deleteError)
  const removedCount = Math.max(0, (cleared ?? []).length - rows.length)

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("travellers").insert(rows)
    if (insertError) return safeSupabaseError("travellers:insert", insertError)
  }

  await syncPrimaryGuestToCustomer(
    supabase,
    booking.customer_id,
    parsed.data.travellers.find((traveller) => traveller.isPrimary),
  )

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "travellers_updated",
    meta: { count: rows.length },
  })

  const { data: reloaded, error: reloadError } = await supabase
    .from("travellers")
    .select(TRAVELLER_COLUMNS)
    .eq("booking_id", id)
    .order("sort_order")

  if (reloadError) return safeSupabaseError("travellers:reload", reloadError)

  const travellers = (reloaded ?? []).map((row) => mapTraveller(row as TravellerRow))

  return Response.json({
    travellers,
    removedCount,
    warning:
      rows.length === 0 && removedCount > 0
        ? `${removedCount} guest${removedCount === 1 ? "" : "s"} removed — ID numbers and dates of birth were deleted with them.`
        : null,
    paxComparison: await loadPaxComparison(supabase, id, travellers),
  })
}
