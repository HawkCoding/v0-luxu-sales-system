import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

const RESERVATION_DETAILS_COLUMNS =
  "id, booking_id, dietary, medical, occasion, smoking_preference, meal_seating, agency_name, agency_address, updated_at"

const reservationDetailsSchema = z.object({
  dietary: z.string().trim().max(500).nullable().optional(),
  medical: z.string().trim().max(500).nullable().optional(),
  occasion: z.string().trim().max(200).nullable().optional(),
  smokingPreference: z.enum(["smoking", "non_smoking"]).nullable().optional(),
  mealSeating: z.enum(["first", "second"]).nullable().optional(),
  agencyName: z.string().trim().max(200).nullable().optional(),
  agencyAddress: z.string().trim().max(500).nullable().optional(),
})

type ReservationDetailsRow = {
  id: string
  booking_id: string
  dietary: string | null
  medical: string | null
  occasion: string | null
  smoking_preference: string | null
  meal_seating: string | null
  agency_name: string | null
  agency_address: string | null
  updated_at: string
}

function mapDetails(row: ReservationDetailsRow | null) {
  if (!row) {
    return {
      dietary: "",
      medical: "",
      occasion: "",
      smokingPreference: null as "smoking" | "non_smoking" | null,
      mealSeating: null as "first" | "second" | null,
      agencyName: "",
      agencyAddress: "",
      updatedAt: null as string | null,
    }
  }
  return {
    dietary: row.dietary ?? "",
    medical: row.medical ?? "",
    occasion: row.occasion ?? "",
    smokingPreference: (row.smoking_preference as "smoking" | "non_smoking" | null) ?? null,
    mealSeating: (row.meal_seating as "first" | "second" | null) ?? null,
    agencyName: row.agency_name ?? "",
    agencyAddress: row.agency_address ?? "",
    updatedAt: row.updated_at,
  }
}

export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const { data, error } = await supabase
    .from("booking_reservation_details")
    .select(RESERVATION_DETAILS_COLUMNS)
    .eq("booking_id", id)
    .maybeSingle()

  if (error) return safeSupabaseError("reservation-details:load", error)

  return Response.json(mapDetails(data as ReservationDetailsRow | null))
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

  const parsed = reservationDetailsSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("reservation-details:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const payload = {
    booking_id: id,
    dietary: parsed.data.dietary?.trim() || null,
    medical: parsed.data.medical?.trim() || null,
    occasion: parsed.data.occasion?.trim() || null,
    smoking_preference: parsed.data.smokingPreference ?? null,
    meal_seating: parsed.data.mealSeating ?? null,
    agency_name: parsed.data.agencyName?.trim() || null,
    agency_address: parsed.data.agencyAddress?.trim() || null,
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("booking_reservation_details")
    .upsert(payload, { onConflict: "booking_id" })
    .select(RESERVATION_DETAILS_COLUMNS)
    .single()

  if (upsertError) return safeSupabaseError("reservation-details:upsert", upsertError)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: id,
    action: "reservation_details_updated",
  })

  return Response.json(mapDetails(upserted as ReservationDetailsRow))
}
