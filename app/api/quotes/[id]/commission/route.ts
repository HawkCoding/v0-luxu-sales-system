import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import { buildCommissionBreakdown, calculateCommissionAmount } from "@/lib/pricing/commission"
import { applyCommissionBonus, findCommissionLineIndex } from "@/lib/quotes/apply-commission-bonus"
import { calculateQuoteTotals, roundMoney } from "@/lib/quotes/pricing-engine"
import type { Json } from "@/lib/supabase/types"
import type { CommissionKind, QuoteLineItem } from "@/lib/types"

// Mirrors the Rounding/Agent Commission/Discount edit gate: only editable on a provisional quote.
const EDITABLE_QUOTE_STATUSES = ["draft", "pricing_incomplete", "ready"]

const MAX_COMMISSION_VALUE = 1_000_000

const patchSchema = z.object({
  type: z.enum(["percent", "per_person", "fixed"]),
  value: z.number().min(0).max(MAX_COMMISSION_VALUE),
  ...versionTokenShape,
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Post-hoc editing of the quote's internal Commission line (type/value). Commission used to be
 * decided once in Build Booking before a quote existed; it now defaults to the house rate at
 * apply time (see lib/quotes/build-from-package.ts) and is edited here instead, on the Job
 * Quotes tab alongside Agent Commission and Discount.
 *
 * Deliberately separate from PATCH /api/quotes/[id]: that route treats any changed
 * non-carry-over line as manual pricing and demands an override reason.
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
      "id, booking_id, status, subtotal, total, commission_bonus, agent_commission, discount_amount, updated_at, booking:bookings(no_of_adults, no_of_children)",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (!EDITABLE_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      { error: "Commission can only be changed on a provisional quote" },
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

  const commissionIndex = findCommissionLineIndex(currentLineItems)
  const existingBreakdown = commissionIndex >= 0 ? currentLineItems[commissionIndex].pricingSnapshot?.commission : null

  // The commission base is the subtotal of every OTHER line — never including the Commission
  // line's own (bonus-inclusive) total, or a bonus already folded in would compound each save.
  const otherLinesSubtotal = roundMoney(
    currentLineItems.reduce((sum, li, idx) => (idx === commissionIndex ? sum : sum + li.total), 0),
  )

  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  const bookingHeadcount = (booking?.no_of_adults ?? 0) + (booking?.no_of_children ?? 0)
  const passengerCount = existingBreakdown?.passengerCount ?? (bookingHeadcount > 0 ? bookingHeadcount : 1)

  const commissionAmount = calculateCommissionAmount({
    amountAfterMarkup: otherLinesSubtotal,
    passengerCount,
    resolved: { type: parsed.type as CommissionKind, value: parsed.value, source: "line" },
  })

  const isPerPerson = parsed.type === "per_person"
  const nextBreakdown = buildCommissionBreakdown(
    { type: parsed.type as CommissionKind, value: parsed.value, source: "line" },
    commissionAmount,
    passengerCount,
  )

  const existingSnapshot = commissionIndex >= 0 ? currentLineItems[commissionIndex].pricingSnapshot : null

  const commissionLine: QuoteLineItem = {
    description: "Commission",
    supplierDescription: null,
    qty: isPerPerson ? Math.max(1, passengerCount) : 1,
    unitPrice: isPerPerson ? parsed.value : commissionAmount,
    total: commissionAmount,
    pricingSnapshot: existingSnapshot
      ? {
          ...existingSnapshot,
          baseUnitPrice: isPerPerson ? parsed.value : commissionAmount,
          commission: nextBreakdown,
          unit: isPerPerson ? "per person" : null,
        }
      : {
            source: "pricing_engine",
            pricingMode: "rate_card",
            packageId: "",
            packageName: "",
            legId: null,
            legLabel: null,
            supplierId: null,
            supplierName: null,
            supplierKind: null,
            routeId: null,
            routeName: null,
            suiteTypeId: null,
            suiteTypeName: null,
            rateCardId: null,
            travelDate: "",
            passengerKind: "service",
            baseUnitPrice: isPerPerson ? parsed.value : commissionAmount,
            markupPct: 0,
            singleSupplementPct: null,
            serviceType: null,
            commission: nextBreakdown,
            unit: isPerPerson ? "per person" : null,
          },
  }

  const lineItemsWithCommission =
    commissionIndex >= 0
      ? currentLineItems.map((li, idx) => (idx === commissionIndex ? commissionLine : li))
      : [...currentLineItems, commissionLine]

  // Re-fold the existing Rounding top-up so it survives a Commission edit, same as every other
  // rebuild of the Commission line (see build-from-package.ts and commission-bonus/route.ts).
  const nextLineItems = applyCommissionBonus(lineItemsWithCommission, Number(quote.commission_bonus ?? 0))

  const { subtotal, total } = calculateQuoteTotals(
    nextLineItems,
    Number(quote.agent_commission ?? 0),
    Number(quote.discount_amount ?? 0),
  )

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

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    action: "quote_commission_changed",
    before_json: {
      commission: existingBreakdown,
      subtotal: quote.subtotal,
      total: quote.total,
    } as Json,
    after_json: {
      commission: nextBreakdown,
      subtotal,
      total,
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
    lineItems: nextLineItems,
    updatedAt: updatedQuote.updated_at,
  })
}
