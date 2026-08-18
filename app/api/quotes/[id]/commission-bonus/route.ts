import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import { applyCommissionBonus } from "@/lib/quotes/apply-commission-bonus"
import { calculateQuoteTotals } from "@/lib/quotes/pricing-engine"
import type { Json } from "@/lib/supabase/types"
import type { QuoteLineItem } from "@/lib/types"

// Mirrors the quotes tab's delete-line gate: the bonus is only editable while the
// quote is still provisional, before a client has seen the total.
const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

const MAX_COMMISSION_BONUS = 1_000_000

const patchSchema = z.object({
  bonus: z.number().min(-MAX_COMMISSION_BONUS).max(MAX_COMMISSION_BONUS),
  ...versionTokenShape,
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Sets the flat manual amount folded into the quote's Commission line.
 *
 * Deliberately separate from PATCH /api/quotes/[id]: that route treats any changed
 * non-carry-over line as manual pricing and demands an override reason, which would
 * make every bonus edit require one.
 */
export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  let parsed
  try {
    parsed = patchSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  // The bonus is re-folded into a rebuilt line-item set, so the same stale-write hazard as
  // PATCH /api/quotes/[id] applies. Same contract: a version token, or an explicit force.
  const missingVersionToken = requireVersionTokenOrForce(parsed)
  if (missingVersionToken) return missingVersionToken

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, booking_id, status, subtotal, total, commission_bonus, updated_at")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!EDITABLE_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "Rounding can only be changed on a provisional quote" },
      { status: 409 },
    )
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== quote.updated_at) {
    return staleVersionResponse("quote", quote.updated_at)
  }

  const { data: existingLineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order")

  if (lineItemsError || !existingLineItems) {
    return NextResponse.json({ error: "Failed to load existing line items" }, { status: 500 })
  }

  const currentLineItems: QuoteLineItem[] = existingLineItems.map((li) => ({
    description: li.description,
    supplierDescription: li.supplier_description,
    qty: li.qty,
    unitPrice: Number(li.unit_price),
    total: Number(li.total),
    pricingSnapshot: li.pricing_snapshot as QuoteLineItem["pricingSnapshot"],
  }))

  const bonus = parsed.bonus
  const nextLineItems = applyCommissionBonus(currentLineItems, bonus)
  const { subtotal, total } = calculateQuoteTotals(nextLineItems)

  const rows = nextLineItems.map((li, idx) => ({
    description: li.description,
    supplier_description: li.supplierDescription ?? null,
    qty: li.qty,
    unit_price: li.unitPrice,
    total: li.total,
    sort_order: idx,
    pricing_snapshot: li.pricingSnapshot ?? null,
  }))

  const { error: replaceError } = await supabase.rpc("replace_quote_line_items", {
    p_quote_id: id,
    p_line_items: rows as Json,
    p_subtotal: subtotal,
    p_total: total,
  })

  if (replaceError) {
    return NextResponse.json({ error: "Failed to update commission" }, { status: 500 })
  }

  const { error: bonusUpdateError } = await supabase
    .from("quotes")
    .update({ commission_bonus: bonus })
    .eq("id", id)

  if (bonusUpdateError) {
    return NextResponse.json({ error: "Failed to save rounding" }, { status: 500 })
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_commission_bonus_changed",
    before_json: {
      commissionBonus: Number(quote.commission_bonus ?? 0),
      subtotal: quote.subtotal,
      total: quote.total,
      lineItems: existingLineItems,
    } as Json,
    after_json: {
      commissionBonus: bonus,
      subtotal,
      total,
      lineItems: rows,
    } as Json,
  })

  if (auditError) {
    return NextResponse.json({ error: "Failed to write commission audit log" }, { status: 500 })
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
    subtotal,
    total,
    commissionBonus: bonus,
    lineItems: nextLineItems,
    updatedAt: updatedQuote.updated_at,
  })
}
