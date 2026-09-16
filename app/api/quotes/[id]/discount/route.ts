import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import { calculateCommissionAmount } from "@/lib/pricing/commission"
import { findCommissionLineIndex } from "@/lib/quotes/apply-commission-bonus"
import { calculateQuoteTotals } from "@/lib/quotes/pricing-engine"
import type { Json } from "@/lib/supabase/types"
import type { CommissionKind, QuoteLineItem } from "@/lib/types"

// Mirrors the Rounding/Agent Commission edit gate: the discount is only editable while the
// quote is still provisional, before a client has seen the total.
const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

const MAX_DISCOUNT_VALUE = 1_000_000

const patchSchema = z.object({
  type: z.enum(["percent", "per_person", "fixed"]),
  value: z.number().min(0).max(MAX_DISCOUNT_VALUE),
  visible: z.boolean(),
  ...versionTokenShape,
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Sets the client-facing Discount — typed the same way as Commission (percent / per_person /
 * fixed), but deducted at the same final step as Agent Commission rather than changing what
 * Commission was calculated on. Unlike Agent Commission, a percent/per_person type needs a
 * base amount and passenger count to resolve to a rand figure, so this route (unlike
 * agent-commission/route.ts) reads quote_line_items — only to recover the passenger count off
 * the existing Commission line, never to change them.
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
    .select(
      "id, status, subtotal, total, agent_commission, discount_type, discount_value, discount_amount, discount_visible, updated_at",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!EDITABLE_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "Discount can only be changed on a provisional quote" },
      { status: 409 },
    )
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== quote.updated_at) {
    return staleVersionResponse("quote", quote.updated_at)
  }

  const subtotal = Number(quote.subtotal)
  const agentCommission = Number(quote.agent_commission ?? 0)

  let passengerCount = 1
  if (parsed.type === "per_person") {
    const { data: existingLineItems } = await supabase
      .from("quote_line_items")
      .select("description, supplier_description, qty, unit_price, total, pricing_snapshot")
      .eq("quote_id", id)
      .order("sort_order")
    const lineItems: QuoteLineItem[] = (existingLineItems ?? []).map((li) => ({
      description: li.description,
      supplierDescription: li.supplier_description,
      qty: li.qty,
      unitPrice: Number(li.unit_price),
      total: Number(li.total),
      pricingSnapshot: li.pricing_snapshot as QuoteLineItem["pricingSnapshot"],
    }))
    const commissionIndex = findCommissionLineIndex(lineItems)
    const snapshotCommission = commissionIndex >= 0 ? lineItems[commissionIndex].pricingSnapshot?.commission : null
    if (snapshotCommission?.passengerCount) passengerCount = snapshotCommission.passengerCount
  }

  const discountAmount = calculateCommissionAmount({
    amountAfterMarkup: subtotal,
    passengerCount,
    resolved: { type: parsed.type as CommissionKind, value: parsed.value, source: "line" },
  })

  if (agentCommission + discountAmount > subtotal) {
    return NextResponse.json(
      { error: "Agent Commission and Discount together cannot exceed the quote subtotal" },
      { status: 400 },
    )
  }

  const { subtotal: nextSubtotal, total } = calculateQuoteTotals(
    [{ description: "", supplierDescription: null, qty: 1, unitPrice: subtotal, total: subtotal }],
    agentCommission,
    discountAmount,
  )

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      discount_type: parsed.type,
      discount_value: parsed.value,
      discount_amount: discountAmount,
      discount_visible: parsed.visible,
      total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updateError) {
    return NextResponse.json({ error: "Failed to save Discount" }, { status: 500 })
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_discount_changed",
    before_json: {
      discountType: quote.discount_type,
      discountValue: Number(quote.discount_value ?? 0),
      discountAmount: Number(quote.discount_amount ?? 0),
      discountVisible: quote.discount_visible,
      total: quote.total,
    } as Json,
    after_json: {
      discountType: parsed.type,
      discountValue: parsed.value,
      discountAmount,
      discountVisible: parsed.visible,
      total,
    } as Json,
  })

  if (auditError) {
    return NextResponse.json({ error: "Failed to write Discount audit log" }, { status: 500 })
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
    discountType: parsed.type,
    discountValue: parsed.value,
    discountAmount,
    discountVisible: parsed.visible,
    updatedAt: updatedQuote.updated_at,
  })
}
