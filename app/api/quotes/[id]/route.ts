import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import { calculateQuoteTotals, isMissingPricing, isPricingEngineLineItem, roundMoney } from "@/lib/quotes/pricing-engine"
import { syncBookingRoute } from "@/lib/quotes/resolve-primary-route"
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
  ...versionTokenShape,
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Statuses whose line items are a record rather than a working draft. An accepted quote is what
 * the customer bought — and what the voucher, itinerary and invoice now render from — so editing
 * it in place would silently rewrite the sold scope. `Revise` is the supported path: it
 * supersedes this quote and opens a new version (see lib/quotes/revision-reset.ts).
 *
 * `sent` is deliberately left editable: nothing renders off a quote before it is accepted, so
 * locking it would restrict the salesperson for no integrity gain.
 */
const LOCKED_QUOTE_STATUSES = ["accepted", "superseded", "cancelled"]

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

  const result = patchQuoteSchema.safeParse(raw)
  if (!result.success) return jsonZodError(result.error)
  const parsed = result.data

  // This PATCH replaces the whole line-item set, so a save built from a stale copy deletes the
  // lines someone else added rather than failing to merge them. The version token is therefore
  // mandatory — see requireVersionTokenOrForce for the force: true escape hatch.
  const missingVersionToken = requireVersionTokenOrForce(parsed)
  if (missingVersionToken) return missingVersionToken

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, booking_id, subtotal, total, status, updated_at, override_reason")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== quote.updated_at) {
    return staleVersionResponse("quote", quote.updated_at)
  }

  if (LOCKED_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      {
        error:
          quote.status === "accepted"
            ? "An accepted quote cannot be edited. Use Revise to create a new version."
            : `A ${quote.status} quote cannot be edited.`,
      },
      { status: 409 },
    )
  }

  const normalizedLineItems: QuoteLineItem[] = parsed.lineItems.map((li) => ({
    description: li.description,
    supplierDescription: li.supplierDescription ?? null,
    qty: li.qty,
    unitPrice: li.unitPrice,
    total: roundMoney(li.unitPrice * li.qty),
    pricingSnapshot: li.pricingSnapshot as QuoteLineItem["pricingSnapshot"],
  }))

  const { data: previousLineItems, error: previousLineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order")

  if (previousLineItemsError) {
    return NextResponse.json({ error: "Failed to load existing line items" }, { status: 500 })
  }

  // Only a genuinely new or price-changed manual line requires an override
  // reason. Deletes, reorders, and unchanged carry-over lines don't — otherwise
  // any package quote (whose child legs carry no pricing snapshot) would be
  // permanently un-editable.
  const lineKey = (description: string, qty: number, unitPrice: number) =>
    `${description}|${qty}|${roundMoney(unitPrice)}`

  const existingKeys = new Map<string, number>()
  for (const prev of previousLineItems ?? []) {
    const key = lineKey(prev.description, prev.qty, Number(prev.unit_price))
    existingKeys.set(key, (existingKeys.get(key) ?? 0) + 1)
  }

  const isManualPricing = normalizedLineItems.some((lineItem) => {
    if (isPricingEngineLineItem(lineItem)) return false
    const key = lineKey(lineItem.description, lineItem.qty, lineItem.unitPrice)
    const remaining = existingKeys.get(key) ?? 0
    if (remaining === 0) return true
    existingKeys.set(key, remaining - 1)
    return false
  })
  const overrideReason = parsed.overrideReason?.trim()

  if (isManualPricing && !overrideReason) {
    return NextResponse.json(
      { error: "Manual pricing changes require an override reason" },
      { status: 400 },
    )
  }

  const { subtotal, total } = calculateQuoteTotals(normalizedLineItems)

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
    p_total: total,
  })

  if (replaceError) {
    return NextResponse.json({ error: "Failed to replace line items" }, { status: 500 })
  }

  const { error: routeSyncError } = await syncBookingRoute(supabase, quote.booking_id, normalizedLineItems)
  if (routeSyncError) {
    return NextResponse.json({ error: routeSyncError }, { status: 500 })
  }

  // override_reason used to be write-only: nothing ever nulled it, so a "PRICING OVERRIDE" banner
  // from a one-off manual line stuck to the quote forever — even once every line was replaced with
  // ordinary rate-card pricing. It's cleared once no line is manual any more, but an unchanged
  // carry-over manual line (isManualPricing is false for those, by design — see the comment above)
  // must not clear a reason that's still true: the banner tracks "is any line on this quote
  // hand-priced", not "did this particular save introduce one".
  const hasManualLine = normalizedLineItems.some((li) => !isPricingEngineLineItem(li))
  const nextOverrideReason =
    isManualPricing && overrideReason
      ? overrideReason
      : hasManualLine
        ? quote.override_reason
        : null
  if (nextOverrideReason !== quote.override_reason) {
    const { error: quoteOverrideError } = await supabase
      .from("quotes")
      .update({ override_reason: nextOverrideReason })
      .eq("id", id)

    if (quoteOverrideError) {
      return NextResponse.json({ error: "Failed to update quote override reason" }, { status: 500 })
    }
  }

  // A line with no price yet (e.g. a flight leg whose fare hasn't been typed in) keeps the quote
  // out of "draft" until it's resolved. Only toggles between these two statuses -- a quote already
  // sent/accepted/etc. isn't silently reverted by re-saving its lines.
  const hasIncompletePricing = normalizedLineItems.some(isMissingPricing)
  const nextStatus = hasIncompletePricing ? "pricing_incomplete" : "draft"
  if ((quote.status === "draft" || quote.status === "pricing_incomplete") && quote.status !== nextStatus) {
    const { error: statusError } = await supabase.from("quotes").update({ status: nextStatus }).eq("id", id)
    if (statusError) {
      return NextResponse.json({ error: "Failed to update quote status" }, { status: 500 })
    }
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_edited",
    before_json: {
      subtotal: quote.subtotal,
      total: quote.total,
      lineItems: previousLineItems ?? [],
    } as Json,
    after_json: {
      subtotal,
      total,
      lineItems,
    } as Json,
    ...(isManualPricing && overrideReason
      ? {
          meta_json: { reason: overrideReason } as Json,
          override_reason: overrideReason,
          overridden_by: user.id,
        }
      : {}),
  })

  if (auditError) {
    return NextResponse.json({ error: "Failed to write quote edit audit log" }, { status: 500 })
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
    lineItems: normalizedLineItems,
    updatedAt: updatedQuote.updated_at,
  })
}