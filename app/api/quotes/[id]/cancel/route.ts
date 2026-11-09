import { NextResponse } from "next/server"
import { requireRole } from "@/lib/api/auth"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/supabase/types"

const CANCELLABLE_STATUSES = ["draft", "pricing_incomplete", "ready", "sent"]

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, quote_number, booking_id, parent_quote_id")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!CANCELLABLE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "Only quotes that have not been accepted can be cancelled" },
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

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_cancelled",
    before_json: { status: quote.status } as Json,
    after_json: { status: "cancelled" } as Json,
  })

  if (auditError) {
    return NextResponse.json({ error: "Failed to write quote cancel audit log" }, { status: 500 })
  }

  // A revision marks the quote it was made from as "superseded". Cancelling the revision must not
  // leave the booking with no live quote, so the parent comes back as "sent": revising rewound the
  // booking, so it is re-accepted through the normal flow rather than restored as accepted.
  let reactivatedQuoteId: string | null = null
  if (quote.parent_quote_id) {
    const reactivated = await reactivateParentQuote(supabase, {
      cancelledQuoteId: id,
      parentQuoteId: quote.parent_quote_id,
      actorName: profile.actorName,
      actorUserId: user.id,
    })
    if (!reactivated.ok) {
      return NextResponse.json({ error: "Quote cancelled but the earlier quote could not be reactivated" }, { status: 500 })
    }
    reactivatedQuoteId = reactivated.quoteId
  }

  return NextResponse.json({ id, status: "cancelled", reactivatedQuoteId })
}

async function reactivateParentQuote(
  supabase: SupabaseClient<Database>,
  input: { cancelledQuoteId: string; parentQuoteId: string; actorName: string; actorUserId: string },
): Promise<{ ok: true; quoteId: string | null } | { ok: false }> {
  const { data: parent, error: parentError } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("id", input.parentQuoteId)
    .maybeSingle()
  if (parentError) return { ok: false }
  if (!parent || parent.status !== "superseded") return { ok: true, quoteId: null }

  // Another revision of the same parent is still live: that is the current quote, leave the parent closed.
  const { data: siblings, error: siblingError } = await supabase
    .from("quotes")
    .select("id, status")
    .eq("parent_quote_id", input.parentQuoteId)
    .neq("id", input.cancelledQuoteId)
  if (siblingError) return { ok: false }
  if ((siblings ?? []).some((s) => s.status !== "cancelled" && s.status !== "superseded")) {
    return { ok: true, quoteId: null }
  }

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ status: "sent", updated_at: new Date().toISOString() })
    .eq("id", parent.id)
  if (updateError) return { ok: false }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: input.actorName,
    actor_user_id: input.actorUserId,
    entity_type: "Quote",
    entity_id: parent.id,
    action: "quote_reactivated",
    before_json: { status: "superseded" } as Json,
    after_json: { status: "sent", reason: "revision_cancelled", cancelled_quote_id: input.cancelledQuoteId } as Json,
  })
  if (auditError) return { ok: false }

  return { ok: true, quoteId: parent.id }
}
