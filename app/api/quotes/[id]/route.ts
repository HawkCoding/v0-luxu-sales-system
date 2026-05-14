import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { staleVersionResponse } from "@/lib/concurrency"
import { calculateQuoteTotals, isPricingEngineLineItem, roundMoney } from "@/lib/quotes/pricing-engine"
import type { Json } from "@/lib/supabase/types"
import type { QuoteLineItem } from "@/lib/types"

const lineItemSchema = z.object({
  description: z.string().min(1),
  supplierDescription: z.string().nullable().optional(),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
  pricingSnapshot: z.unknown().nullable().optional(),
})

const patchQuoteSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1),
  overrideReason: z.string().trim().min(1).max(500).optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  let parsed
  try {
    parsed = patchQuoteSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, subtotal, vat, total, updated_at, override_reason")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== quote.updated_at) {
    return staleVersionResponse("quote", quote.updated_at)
  }

  const normalizedLineItems: QuoteLineItem[] = parsed.lineItems.map((li) => ({
    description: li.description,
    supplierDescription: li.supplierDescription ?? null,
    qty: li.qty,
    unitPrice: li.unitPrice,
    total: roundMoney(li.unitPrice * li.qty),
    pricingSnapshot: li.pricingSnapshot as QuoteLineItem["pricingSnapshot"],
  }))
  const isManualPricing = normalizedLineItems.some((lineItem) => !isPricingEngineLineItem(lineItem))
  const overrideReason = parsed.overrideReason?.trim()

  if (isManualPricing && !overrideReason) {
    return NextResponse.json(
      { error: "Manual pricing changes require an override reason" },
      { status: 400 },
    )
  }

  const { subtotal, vat, total } = calculateQuoteTotals(normalizedLineItems)

  const { data: previousLineItems, error: previousLineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order")

  if (previousLineItemsError) {
    return NextResponse.json({ error: "Failed to load existing line items" }, { status: 500 })
  }

  const lineItems = normalizedLineItems.map((li, idx) => ({
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
    p_line_items: lineItems as Json,
    p_subtotal: subtotal,
    p_vat: vat,
    p_total: total,
  })

  if (replaceError) {
    return NextResponse.json({ error: "Failed to replace line items" }, { status: 500 })
  }

  if (isManualPricing && overrideReason) {
    const { error: quoteOverrideError } = await supabase
      .from("quotes")
      .update({ override_reason: overrideReason })
      .eq("id", id)

    if (quoteOverrideError) {
      return NextResponse.json({ error: "Failed to update quote override reason" }, { status: 500 })
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      actor: profile.actorName,
      actor_user_id: user.id,
      entity_type: "Quote",
      entity_id: id,
      action: "pricing_override",
      before_json: {
        subtotal: quote.subtotal,
        vat: quote.vat,
        total: quote.total,
        lineItems: previousLineItems ?? [],
      } as Json,
      after_json: {
        subtotal,
        vat,
        total,
        lineItems,
      } as Json,
      meta_json: {
        reason: overrideReason,
      } as Json,
      override_reason: overrideReason,
      overridden_by: user.id,
    })

    if (auditError) {
      return NextResponse.json({ error: "Failed to write pricing override audit log" }, { status: 500 })
    }
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
    vat,
    total,
    lineItems: normalizedLineItems,
    updatedAt: updatedQuote.updated_at,
  })
}
