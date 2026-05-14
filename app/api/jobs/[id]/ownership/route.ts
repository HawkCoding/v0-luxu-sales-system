import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import type { Json } from "@/lib/supabase/types"

const ownershipSchema = z.object({
  action: z.enum(["claim", "release", "assign"]),
  userId: z.string().uuid().optional(),
  reason: z.string().optional(),
})

const OWNER_ROLES = new Set(["consultant", "manager", "admin"])
const MANAGER_ROLES = new Set(["manager", "admin"])

function isOwnerRole(role: string): boolean {
  return OWNER_ROLES.has(role)
}

function isManagerRole(role: string): boolean {
  return MANAGER_ROLES.has(role)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value
  const role = profile.clearanceLevel

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = ownershipSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const body = parsed.data
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, assigned_salesperson_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("jobs:ownership-load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  let nextSalespersonId: string | null

  if (body.action === "claim") {
    if (!isOwnerRole(role)) return jsonError("Forbidden", 403)
    if (booking.assigned_salesperson_id) return jsonError("Booking is already assigned", 409)
    nextSalespersonId = user.id
  } else if (body.action === "release") {
    const isAssignedOwner = booking.assigned_salesperson_id === user.id
    if (!isAssignedOwner && !isManagerRole(role)) return jsonError("Forbidden", 403)
    nextSalespersonId = null
  } else {
    if (!isManagerRole(role)) return jsonError("Forbidden", 403)
    if (!body.userId) return jsonError("userId is required for assign", 400)

    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("user_id, clearance_level, is_active")
      .eq("user_id", body.userId)
      .maybeSingle()

    if (targetError) return safeSupabaseError("jobs:ownership-load-target", targetError)
    if (
      !targetProfile ||
      !isOwnerRole(targetProfile.clearance_level) ||
      targetProfile.is_active === false
    ) {
      return jsonError("Assigned salesperson not found", 404)
    }

    nextSalespersonId = body.userId
  }

  const beforeJson = { assigned_salesperson_id: booking.assigned_salesperson_id }
  const afterJson = { assigned_salesperson_id: nextSalespersonId }

  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      assigned_salesperson_id: nextSalespersonId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, assigned_salesperson_id, updated_at")
    .single()

  if (updateError || !updated) return safeSupabaseError("jobs:ownership-update", updateError)

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Booking",
    entity_id: id,
    action: "salesperson_reassigned",
    before_json: beforeJson,
    after_json: afterJson,
    meta_json: {
      ownership_action: body.action,
      reason: body.reason?.trim() || null,
    } satisfies Json,
  })

  if (auditError) return safeSupabaseError("jobs:ownership-audit", auditError)

  return Response.json({
    id: updated.id,
    assignedSalespersonId: updated.assigned_salesperson_id ?? null,
    updatedAt: updated.updated_at,
  })
}
