import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import type { Json } from "@/lib/supabase/types"

// A quote's own journey/rate/train-only overrides -- null on any field means
// "follow Auto" (see lib/quotes/quote-config.ts). Editable while the quote can
// still be re-sent; locked once accepted or otherwise finalised, matching the
// line-item edit rules on the Quotes tab.
const EDITABLE_STATUSES = ["draft", "pricing_incomplete", "ready", "sent"]

const configSchema = z.object({
  journeyClass: z.enum(["short", "long"]).nullable(),
  rateAudience: z.enum(["international", "resident"]).nullable(),
  showTrainOnlyNote: z.boolean().nullable(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  const parsed = configSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, journey_class, rate_audience, show_train_only_note")
    .eq("id", id)
    .maybeSingle()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!EDITABLE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "This quote's configuration can no longer be changed" },
      { status: 400 },
    )
  }

  const { journeyClass, rateAudience, showTrainOnlyNote } = parsed.data

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      journey_class: journeyClass,
      rate_audience: rateAudience,
      show_train_only_note: showTrainOnlyNote,
    })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: "Failed to save quote configuration" }, { status: 500 })
  }

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_config_updated",
    before_json: {
      journeyClass: quote.journey_class,
      rateAudience: quote.rate_audience,
      showTrainOnlyNote: quote.show_train_only_note,
    } as Json,
    after_json: { journeyClass, rateAudience, showTrainOnlyNote } as Json,
  })

  return NextResponse.json({ id, journeyClass, rateAudience, showTrainOnlyNote })
}
