import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, email_import_needs_review")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("jobs:clear-import-review-load", bookingError)
  if (!booking) return jsonError("Booking not found", 404)
  if (!booking.email_import_needs_review) return jsonError("Import review is not pending", 400)

  const resolvedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from("bookings")
    .update({
      email_import_needs_review: false,
      email_import_review_resolved_at: resolvedAt,
      email_import_review_resolved_by: user.id,
      updated_at: resolvedAt,
    })
    .eq("id", id)
    .select("id, email_import_needs_review, email_import_review_resolved_at")
    .single()

  if (updateError || !updated) return safeSupabaseError("jobs:clear-import-review-update", updateError)

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Booking",
    entity_id: id,
    action: "email_import_review_resolved",
    before_json: { email_import_needs_review: booking.email_import_needs_review },
    after_json: { email_import_needs_review: false },
  })

  if (auditError) return safeSupabaseError("jobs:clear-import-review-audit", auditError)

  return Response.json({
    id: updated.id,
    emailImportNeedsReview: updated.email_import_needs_review,
    emailImportReviewResolvedAt: updated.email_import_review_resolved_at,
  })
}
