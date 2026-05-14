import { NextResponse } from "next/server"
import { requireRole } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/responses"

interface RouteParams {
  params: Promise<{ id: string }>
}

const CANCELLABLE_STATUSES = ["draft", "pricing_incomplete", "ready", "sent"]

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, quote_number")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return jsonError("Quote not found", 404)
  }

  if (!CANCELLABLE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: `Cannot cancel a quote with status '${quote.status}'` },
      { status: 400 },
    )
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "cancelled" })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: "Failed to cancel quote" }, { status: 500 })
  }

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_cancelled",
    before_json: { status: quote.status, quote_number: quote.quote_number },
    after_json: { status: "cancelled" },
  })

  return NextResponse.json({ success: true })
}
