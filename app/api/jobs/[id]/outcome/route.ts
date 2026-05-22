import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"

const outcomeSchema = z.object({
  outcome: z.enum(["Open", "Won", "Lost", "Cancelled"]),
  reasonId: z.string().uuid().optional(),
  outcomeNotes: z.string().optional(),
})

const ALLOWED_ROLES = new Set(["consultant", "manager", "admin"])
const MANAGER_ROLES = new Set(["manager", "admin"])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value
  const role = profile.clearanceLevel

  if (!ALLOWED_ROLES.has(role)) {
    return jsonError("Forbidden: read-only users cannot set outcome", 403)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = outcomeSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const body = parsed.data

  // Load booking to check ownership and current outcome
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, outcome, assigned_salesperson_id, owner_user_id")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("jobs:outcome-load", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  // Consultants can only set outcome on bookings they own
  if (role === "consultant") {
    const isOwner =
      booking.assigned_salesperson_id === user.id ||
      booking.owner_user_id === user.id
    if (!isOwner) {
      return jsonError("Forbidden: consultants can only set outcome on their own bookings", 403)
    }
  }

  const { outcome, reasonId, outcomeNotes } = body

  // Lost and Cancelled require a reason
  if ((outcome === "Lost" || outcome === "Cancelled") && !reasonId) {
    return jsonError("A reason is required when setting outcome to Lost or Cancelled", 400)
  }

  // If reason is provided, validate it exists and applies to the selected outcome
  if (reasonId) {
    const { data: reason, error: reasonError } = await supabase
      .from("outcome_reasons")
      .select("id, label, applies_to, active")
      .eq("id", reasonId)
      .maybeSingle()

    if (reasonError) return safeSupabaseError("jobs:outcome-reason-load", reasonError)
    if (!reason || !reason.active) {
      return jsonError("Selected outcome reason not found or inactive", 400)
    }

    // Validate applies_to matches the outcome
    if (reason.applies_to !== "Both" && reason.applies_to !== outcome) {
      return jsonError(`Reason does not apply to outcome '${outcome}'`, 400)
    }

    // "Other" reason requires non-empty notes
    if (reason.label === "Other" && (!outcomeNotes?.trim())) {
      return jsonError("Notes are required when selecting 'Other' as the reason", 400)
    }
  }

  const nowIso = new Date().toISOString()
  const prevOutcome = booking.outcome

  const updates: Record<string, unknown> = {
    outcome,
    outcome_reason_id: reasonId ?? null,
    outcome_notes: outcomeNotes?.trim() ?? null,
    outcome_set_at: nowIso,
    outcome_set_by: user.id,
    updated_at: nowIso,
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update(updates)
    .eq("id", id)

  if (updateError) return safeSupabaseError("jobs:outcome-update", updateError)

  // Emit audit log
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Booking",
    entity_id: id,
    action: "outcome_changed",
    before_json: { outcome: prevOutcome },
    after_json: {
      outcome,
      outcome_reason_id: reasonId ?? null,
      outcome_notes: outcomeNotes?.trim() ?? null,
    },
  })

  if (auditError) return safeSupabaseError("jobs:outcome-audit", auditError)

  return Response.json({ ok: true, outcome })
}
