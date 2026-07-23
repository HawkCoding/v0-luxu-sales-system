import { requireUser } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase, user, profile } = auth.value

  const { data: quotes, error: quotesError } = await supabase
    .from("quotes")
    .select("id, no_package_match")
    .eq("booking_id", id)
    .eq("no_package_match", true)

  if (quotesError) return safeSupabaseError("jobs:dismiss-package-match-load", quotesError)
  if (!quotes || quotes.length === 0) return jsonError("No package-match note is pending", 400)

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ no_package_match: false, updated_at: new Date().toISOString() })
    .eq("booking_id", id)
    .eq("no_package_match", true)

  if (updateError) return safeSupabaseError("jobs:dismiss-package-match-update", updateError)

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Booking",
    entity_id: id,
    action: "no_package_match_note_dismissed",
    before_json: { quoteIds: quotes.map((q) => q.id) },
    after_json: { noPackageMatch: false },
  })

  if (auditError) return safeSupabaseError("jobs:dismiss-package-match-audit", auditError)

  return Response.json({ id, dismissed: true })
}
