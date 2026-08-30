import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import { calculateQuoteTotals } from "@/lib/quotes/pricing-engine"
import type { Json } from "@/lib/supabase/types"

// Mirrors the Rounding field's edit gate: the discount is only editable while the quote is
// still provisional, before a client has seen the total.
const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

const MAX_AGENT_COMMISSION = 1_000_000

const patchSchema = z.object({
  agentCommission: z.number().min(0).max(MAX_AGENT_COMMISSION),
  ...versionTokenShape,
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Sets the flat discount given to a booking agency that sold this journey. Unlike
 * commission-bonus/route.ts (Rounding, folded invisibly into the Commission line), this is a
 * total-level adjustment the client is meant to see — subtotal stays the gross travel price,
 * total becomes what the client actually owes. Line items are never touched, so this route is
 * a plain quotes-row update, no replace_quote_line_items RPC involved.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const result = patchSchema.safeParse(raw)
  if (!result.success) return jsonZodError(result.error)
  const parsed = result.data

  const missingVersionToken = requireVersionTokenOrForce(parsed)
  if (missingVersionToken) return missingVersionToken

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, subtotal, total, agent_commission, updated_at")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!EDITABLE_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "Agent Commission can only be changed on a provisional quote" },
      { status: 409 },
    )
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== quote.updated_at) {
    return staleVersionResponse("quote", quote.updated_at)
  }

  const agentCommission = parsed.agentCommission
  const subtotal = Number(quote.subtotal)

  if (agentCommission > subtotal) {
    return NextResponse.json(
      { error: "Agent Commission cannot exceed the quote subtotal" },
      { status: 400 },
    )
  }

  const { subtotal: nextSubtotal, total } = calculateQuoteTotals(
    // subtotal is a stored total, not a line-item list — this route never touches line items,
    // so calculateQuoteTotals is fed a single synthetic line worth the existing subtotal rather
    // than reloading quote_line_items just to sum them back to the same number.
    [{ description: "", supplierDescription: null, qty: 1, unitPrice: subtotal, total: subtotal }],
    agentCommission,
  )

  const { error: updateError } = await supabase
    .from("quotes")
    .update({ agent_commission: agentCommission, total, updated_at: new Date().toISOString() })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: "Failed to save Agent Commission" }, { status: 500 })
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_agent_commission_changed",
    before_json: {
      agentCommission: Number(quote.agent_commission ?? 0),
      total: quote.total,
    } as Json,
    after_json: {
      agentCommission,
      total,
    } as Json,
  })

  if (auditError) {
    return NextResponse.json({ error: "Failed to write Agent Commission audit log" }, { status: 500 })
  }

  const { data: updatedQuote, error: updatedQuoteError } = await supabase
    .from("quotes")
    .select("updated_at")
    .eq("id", id)
    .single()

  if (updatedQuoteError || !updatedQuote) {
    return NextResponse.json({ error: "Failed to load updated quote" }, { status: 500 })
  }

  return NextResponse.json({
    id,
    subtotal: nextSubtotal,
    total,
    agentCommission,
    updatedAt: updatedQuote.updated_at,
  })
}
