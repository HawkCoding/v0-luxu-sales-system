import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { describeValidationIssue } from "@/lib/api/describe-zod-issue"
import { jsonZodError } from "@/lib/api/responses"
import { requireVersionTokenOrForce, staleVersionResponse, versionTokenShape } from "@/lib/concurrency"
import {
  calculateQuoteTotals,
  isMissingPricing,
  isPricingEngineLineItem,
  resolveLineTotal,
  roundMoney,
} from "@/lib/quotes/pricing-engine"
import { AMEND_NOTE_MAX_LENGTH, amendIneligibilityReason } from "@/lib/quotes/amend-quote"
import { syncBookingRoute } from "@/lib/quotes/resolve-primary-route"
import { syncBookingPaymentState, type BookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"
import type { Json } from "@/lib/supabase/types"
import type { QuoteLineItem } from "@/lib/types"

const lineItemSchema = z.object({
  description: z.string().min(1),
  supplierDescription: z.string().nullable().optional(),
  // A fully complimentary night (or other gifted charge) is a finished line priced at qty 0, not
  // an unpriced one — see isMissingPricing. Rejecting it here would block Apply on exactly the
  // line build-from-package.ts deliberately emits for a comped stay.
  qty: z.number().int().nonnegative(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative(),
  pricingSnapshot: z.unknown().nullable().optional(),
})

const patchQuoteSchema = z
  .object({
    lineItems: z.array(lineItemSchema).min(1),
    overrideReason: z.string().trim().min(1).max(500).optional(),
    /** Explicit opt-in to change an ACCEPTED quote in place — see lib/quotes/amend-quote.ts. */
    amend: z.literal(true).optional(),
    amendNote: z.string().trim().max(AMEND_NOTE_MAX_LENGTH).optional(),
    ...versionTokenShape,
  })
  .refine((body) => body.amendNote === undefined || body.amend === true, {
    message: "amendNote is only accepted together with amend: true",
    path: ["amendNote"],
  })

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Statuses whose line items are a record rather than a working draft. An accepted quote is what
 * the customer bought — and what the voucher, itinerary and invoice now render from — so editing
 * it in place would silently rewrite the sold scope. `Revise` is the full path: it supersedes this
 * quote and opens a new version (see lib/quotes/revision-reset.ts). `amend: true` is the explicit,
 * confirmed exception for an accepted quote only (see lib/quotes/amend-quote.ts).
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

  const rawBody: unknown = await req.json().catch(() => null)
  const parseResult = patchQuoteSchema.safeParse(rawBody)
  if (!parseResult.success) {
    // Name which line failed (and by what description, when the client sent one) instead of a
    // bare "Invalid request payload (lineItems)" the toast could show but the user could do
    // nothing with -- see lib/format-error-details.ts.
    const rawLineItems: unknown[] =
      rawBody && typeof rawBody === "object" && Array.isArray((rawBody as Record<string, unknown>).lineItems)
        ? ((rawBody as Record<string, unknown>).lineItems as unknown[])
        : []
    const firstIssue = parseResult.error.issues[0]
    const message = firstIssue
      ? describeValidationIssue(firstIssue, {
          lineLabel: (index) => {
            const line = rawLineItems[index] as { description?: unknown } | undefined
            const description = typeof line?.description === "string" ? line.description : null
            return description ? `Line ${index + 1} (${description})` : `Line ${index + 1}`
          },
        })
      : "Invalid request payload"
    return jsonZodError(parseResult.error, message, "quotes:patch")
  }
  const parsed = parseResult.data

  // This PATCH replaces the whole line-item set, so a save built from a stale copy deletes the
  // lines someone else added rather than failing to merge them. The version token is therefore
  // mandatory — see requireVersionTokenOrForce for the force: true escape hatch.
  const missingVersionToken = requireVersionTokenOrForce(parsed)
  if (missingVersionToken) return missingVersionToken

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    // The booking is joined rather than fetched separately: syncBookingRoute needs the booking's own
    // primary supplier, or a transfer extra wins the route (see resolvePrimaryRoute). Kept as one
    // string literal — supabase-js infers the row type from the literal and gives up on a concat.
    .select(
      "id, booking_id, subtotal, total, status, updated_at, override_reason, agent_commission, discount_amount, booking:bookings(primary_supplier_id, stage, cancelled_at)",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  if (parsed.expectedUpdatedAt && parsed.expectedUpdatedAt !== quote.updated_at) {
    return staleVersionResponse("quote", quote.updated_at)
  }

  const quoteBooking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
  // Amend is an explicit opt-in that only ever applies to an accepted quote on a live booking. A
  // plain PATCH (no `amend`) keeps the original lock below, so nothing reaches an accepted quote by
  // accident; `amend: true` on any other status is refused rather than silently treated as an edit.
  const isAmend = parsed.amend === true
  if (isAmend) {
    const reason = amendIneligibilityReason({
      quoteStatus: quote.status,
      bookingStage: quoteBooking?.stage ?? null,
      bookingCancelledAt: quoteBooking?.cancelled_at ?? null,
    })
    if (reason) return NextResponse.json({ error: reason }, { status: 409 })
  } else if (LOCKED_QUOTE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      {
        error:
          quote.status === "accepted"
            ? "An accepted quote cannot be edited. Use Amend to change it in place, or Revise to create a new version."
            : `A ${quote.status} quote cannot be edited.`,
      },
      { status: 409 },
    )
  }

  const normalizedLineItems: QuoteLineItem[] = parsed.lineItems.map((li) => {
    const normalized = {
      description: li.description,
      supplierDescription: li.supplierDescription ?? null,
      qty: li.qty,
      unitPrice: li.unitPrice,
      pricingSnapshot: li.pricingSnapshot as QuoteLineItem["pricingSnapshot"],
    }
    // The client's own `total` is still discarded — it is not a trustworthy figure — but the
    // recompute runs through resolveLineTotal so a comped transfer's R0 is not turned back into a
    // charge that then flows into the deposit and final invoices.
    return { ...normalized, total: resolveLineTotal(normalized) }
  })

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

  // A draft can sit at pricing_incomplete until a fare is typed in; an accepted quote has no such
  // state to fall back to, and the client is already invoiced off it — so an amendment may not
  // introduce an unpriced line. An unchanged carry-over (e.g. an old R0 package child leg) is
  // tolerated: it was already on the quote the client accepted.
  if (isAmend) {
    const carriedOver = new Map(existingKeys)
    const introducesUnpricedLine = normalizedLineItems.some((lineItem) => {
      const key = lineKey(lineItem.description, lineItem.qty, lineItem.unitPrice)
      const remaining = carriedOver.get(key) ?? 0
      if (remaining > 0) {
        carriedOver.set(key, remaining - 1)
        return false
      }
      return isMissingPricing(lineItem)
    })
    if (introducesUnpricedLine) {
      return NextResponse.json(
        { error: "Every new line needs a price before an accepted quote can be amended." },
        { status: 400 },
      )
    }
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

  // A line-item edit must not silently wipe out an existing agent commission or discount —
  // both are total-level adjustments, unrelated to which lines make up the subtotal.
  const { subtotal, total } = calculateQuoteTotals(
    normalizedLineItems,
    Number(quote.agent_commission ?? 0),
    Number(quote.discount_amount ?? 0),
  )

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

  const { error: routeSyncError } = await syncBookingRoute(
    supabase,
    quote.booking_id,
    normalizedLineItems,
    quoteBooking?.primary_supplier_id ?? null,
  )
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

  const amendNote = parsed.amendNote?.trim() || null
  const auditMeta: Record<string, Json> = {
    ...(isManualPricing && overrideReason ? { reason: overrideReason } : {}),
    ...(isAmend
      ? {
          amendNote,
          bookingId: quote.booking_id,
          bookingStage: quoteBooking?.stage ?? null,
          emailsSent: false,
        }
      : {}),
  }
  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: id,
    // An amendment rewrites what an accepted booking costs, so it is its own action — easy to find
    // when someone later asks why the invoice total moved without a revision.
    action: isAmend ? "quote_amended" : "quote_edited",
    before_json: {
      subtotal: quote.subtotal,
      total: quote.total,
      lineCount: previousLineItems?.length ?? 0,
      lineItems: previousLineItems ?? [],
    } as Json,
    after_json: {
      subtotal,
      total,
      lineCount: lineItems.length,
      lineItems,
    } as Json,
    ...(Object.keys(auditMeta).length > 0 ? { meta_json: auditMeta as Json } : {}),
    ...(isManualPricing && overrideReason
      ? {
          override_reason: overrideReason,
          overridden_by: user.id,
        }
      : {}),
  })

  if (auditError) {
    return NextResponse.json({ error: "Failed to write quote edit audit log" }, { status: 500 })
  }

  // The accepted quote's total is what the booking's balance is measured against, so an amendment
  // re-derives invoice_balance / overpaid_amount (and the paid flags on the invoice rows) from the
  // recorded payments. The deposit invoice's amount is deliberately left alone. Nothing here sends
  // email or voids anything. The lines are already saved, so a failure is reported as a warning
  // rather than a 500 the client would retry into a stale-version 409.
  let paymentState: BookingPaymentState | null = null
  let balanceWarning: string | null = null
  if (isAmend) {
    try {
      paymentState = await syncBookingPaymentState(supabase, quote.booking_id, {
        actorName: profile.actorName,
        actorUserId: user.id,
      })
    } catch (error) {
      console.error("quotes:amend:balance-sync", error)
      balanceWarning = "Quote amended, but the booking balance could not be refreshed. Reload the booking to check it."
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
    total,
    lineItems: normalizedLineItems,
    updatedAt: updatedQuote.updated_at,
    ...(isAmend
      ? {
          amended: true,
          invoiceBalance: paymentState?.invoiceBalance ?? null,
          ...(balanceWarning ? { warning: balanceWarning } : {}),
        }
      : {}),
  })
}