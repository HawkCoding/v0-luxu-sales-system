import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import { computeQuoteAdjustments } from "@/lib/quotes/quote-adjustments"
import { writeAuditLog } from "@/lib/audit-write"
import type { Json } from "@/lib/supabase/types"
import type { QuoteLineItem } from "@/lib/types"

// Mirrors the individual Commission/Rounding/Agent Commission/Discount routes' edit gate: all
// four are only editable while the quote is still provisional, before a client has seen the total.
const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

const MAX_ADJUSTMENT_VALUE = 1_000_000
const commissionKind = z.enum(["percent", "per_person", "fixed"])

const patchSchema = z.object({
  commission: z.object({ type: commissionKind, value: z.number().min(0).max(MAX_ADJUSTMENT_VALUE) }).nullable(),
  commissionBonus: z.number().min(0, "Rounding can't be negative — use a discount instead.").max(MAX_ADJUSTMENT_VALUE),
  agentCommission: z.number().min(0).max(MAX_ADJUSTMENT_VALUE),
  discount: z
    .object({ type: commissionKind, value: z.number().min(0).max(MAX_ADJUSTMENT_VALUE), visible: z.boolean() })
    .nullable(),
  ...versionTokenShape,
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Replaces the four separate PATCH /commission, /commission-bonus, /agent-commission and
 * /discount routes with a single save for the quote's totals ledger (Commission, Rounding, Agent
 * Commission, Discount) — see components/quotes/quote-adjustments-ledger.tsx. One request means
 * the four can never half-save relative to each other, and Discount is always resolved against
 * the subtotal this same save produces (see lib/quotes/quote-adjustments.ts).
 *
 * Deliberately separate from PATCH /api/quotes/[id]: that route treats any changed non-carry-over
 * line as manual pricing and demands an override reason, which would make every adjustment edit
 * require one.
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
      "id, booking_id, status, subtotal, total, commission_bonus, agent_commission, discount_type, discount_value, discount_amount, discount_visible, updated_at, booking:bookings(no_of_adults, no_of_children)",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!EDITABLE_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "Pricing adjustments can only be changed on a provisional quote" },
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
    return safeSupabaseError("quotes:adjustments:load-lines", lineItemsError, "Failed to load existing line items")
  }

  const currentLineItems: QuoteLineItem[] = existingLineItems.map((li) => ({
    description: li.description,
    supplierDescription: li.supplier_description,
    qty: li.qty,
    unitPrice: Number(li.unit_price),
    total: Number(li.total),
    pricingSnapshot: li.pricing_snapshot as QuoteLineItem["pricingSnapshot"],
  }))

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const bookingHeadcount = (booking?.no_of_adults ?? 0) + (booking?.no_of_children ?? 0)

  const adjustments = computeQuoteAdjustments(currentLineItems, {
    commission: parsed.commission,
    commissionBonus: parsed.commissionBonus,
    agentCommission: parsed.agentCommission,
    discount: parsed.discount,
    bookingHeadcount,
  })

  if (adjustments.errors.length > 0) {
    return jsonError(adjustments.errors[0], 400, adjustments.errors)
  }

  const rows = adjustments.lineItems.map((li, idx) => ({
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
    p_subtotal: adjustments.subtotal,
    p_total: adjustments.total,
  })

  if (replaceError) return safeSupabaseError("quotes:adjustments:replace-lines", replaceError, "Failed to save adjustments")

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      commission_bonus: parsed.commissionBonus,
      agent_commission: adjustments.agentCommission,
      discount_type: parsed.discount?.type ?? null,
      discount_value: parsed.discount?.value ?? 0,
      discount_amount: adjustments.discountAmount,
      discount_visible: parsed.discount?.visible ?? true,
      total: adjustments.total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updateError) return safeSupabaseError("quotes:adjustments:update-quote", updateError, "Failed to save adjustments")

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Quote",
    entityId: id,
    action: "quote_adjustments_changed",
    before: {
      commissionBonus: Number(quote.commission_bonus ?? 0),
      agentCommission: Number(quote.agent_commission ?? 0),
      discountType: quote.discount_type,
      discountValue: Number(quote.discount_value ?? 0),
      discountAmount: Number(quote.discount_amount ?? 0),
      subtotal: Number(quote.subtotal),
      total: Number(quote.total),
    } as Json,
    after: {
      commissionBonus: parsed.commissionBonus,
      agentCommission: adjustments.agentCommission,
      discountType: parsed.discount?.type ?? null,
      discountValue: parsed.discount?.value ?? 0,
      discountAmount: adjustments.discountAmount,
      subtotal: adjustments.subtotal,
      total: adjustments.total,
    } as Json,
  })

  const { data: updatedQuote, error: updatedQuoteError } = await supabase
    .from("quotes")
    .select("updated_at")
    .eq("id", id)
    .single()

  if (updatedQuoteError || !updatedQuote) {
    return safeSupabaseError("quotes:adjustments:reload", updatedQuoteError, "Failed to load updated quote")
  }

  return NextResponse.json({
    id,
    subtotal: adjustments.subtotal,
    total: adjustments.total,
    commissionBonus: parsed.commissionBonus,
    agentCommission: adjustments.agentCommission,
    discountType: parsed.discount?.type ?? null,
    discountValue: parsed.discount?.value ?? 0,
    discountAmount: adjustments.discountAmount,
    discountVisible: parsed.discount?.visible ?? true,
    lineItems: adjustments.lineItems,
    updatedAt: updatedQuote.updated_at,
  })
}
