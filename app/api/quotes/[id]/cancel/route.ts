import { NextResponse } from "next/server"
import { requireRole } from "@/lib/api/auth"
import type { Json } from "@/lib/supabase/types"

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
    .select("id, status, quote_number, booking_id")
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

  return NextResponse.json({ id, status: "cancelled" })
}
