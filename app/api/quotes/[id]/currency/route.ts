import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { safeSupabaseError } from "@/lib/api/responses"
import { calculateQuoteTotals, roundMoney } from "@/lib/quotes/pricing-engine"
import { applyFxRate, roundFxRate } from "@/lib/pricing/convert-currency"
import { normaliseCurrency } from "@/lib/money"
import { SUPPORTED_CURRENCY_VALUES } from "@/lib/types"
import type { CommissionBreakdown, PricingSnapshot } from "@/lib/types"
import type { Json } from "@/lib/supabase/types"
import { writeAuditLog } from "@/lib/audit-write"
import { bookingEditIneligibilityReason } from "@/lib/quotes/amend-quote"
import { syncBookingPaymentState } from "@/lib/invoices/sync-booking-payment-state"

/**
 * Re-denominates a quote into another currency.
 *
 * A provisional quote (nothing has gone out) is converted freely. A quote the client already holds
 * (sent, expired, accepted) can be converted too, but only while NO payment is recorded: payments
 * are real money in a real currency, and rewriting them would make the booking's balance disagree
 * with the bank. If money has been received the answer is to remove the payments, change the
 * currency, and record them again in the new one. The invoices raised off the quote move with it
 * (same rate), and the Documents tab then shows the client's copies as out of date.
 *
 * A replaced (superseded) or cancelled quote is history and is never converted.
 */

const PROVISIONAL_STATUSES = ["draft", "pricing_incomplete", "ready"]
const LIVE_STATUSES = ["sent", "expired", "accepted"]

const postSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCY_VALUES),
  /** Multiplier from the quote's current currency to the target. Bounded so a mistyped decimal
   *  point cannot silently re-price a booking by an order of magnitude. */
  rate: z.number().positive().max(10_000),
  /** The rate's publication date, stamped onto each line for the internal provenance note. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

/**
 * The Commission line's breakdown, re-denominated alongside its line. The ledger reads the typed
 * value and calculated amount straight off it, and a Build Booking rebuild reuses the typed value
 * as the quote's commission setting — so leaving it in the old currency showed the pre-conversion
 * figure on the ledger and re-priced the rebuilt Commission at, say, R2 000 read as $2 000.
 *
 * A percent's value is currency-neutral (same as a percent discount); fixed/per_person values,
 * the calculated amount and the Rounding bonus are all money and convert.
 */
function convertCommission(commission: CommissionBreakdown, rate: number): CommissionBreakdown {
  const value = commission.type === "percent" ? commission.value : applyFxRate(commission.value, rate)
  // A per-person amount is value x headcount — recomputed from the converted value so it agrees
  // exactly with the line's own converted unitPrice x qty rather than drifting a cent from it.
  const amount =
    commission.type === "per_person" && typeof commission.passengerCount === "number"
      ? roundMoney(value * commission.passengerCount)
      : applyFxRate(commission.amount, rate)
  return {
    ...commission,
    value,
    amount,
    ...(typeof commission.bonus === "number" ? { bonus: applyFxRate(commission.bonus, rate) } : {}),
  }
}

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, profile, user } = auth.value
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id, booking_id, currency, status, subtotal, total, commission_bonus, agent_commission, discount_type, discount_value, discount_amount, booking:bookings(stage, cancelled_at)",
    )
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const fromCurrency = normaliseCurrency(quote.currency)
  const toCurrency = parsed.data.currency

  if (fromCurrency === toCurrency) {
    return NextResponse.json({ error: `This quote is already in ${toCurrency}.` }, { status: 400 })
  }

  const isLive = LIVE_STATUSES.includes(quote.status)
  if (!PROVISIONAL_STATUSES.includes(quote.status) && !isLive) {
    return NextResponse.json(
      { error: "A replaced or cancelled quote can't be re-priced in another currency.", code: "NOT_CONVERTIBLE" },
      { status: 409 },
    )
  }

  if (isLive) {
    const quoteBooking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking
    const bookingReason = bookingEditIneligibilityReason({
      bookingStage: quoteBooking?.stage ?? null,
      bookingCancelledAt: quoteBooking?.cancelled_at ?? null,
    })
    if (bookingReason) return NextResponse.json({ error: bookingReason, code: "NOT_CONVERTIBLE" }, { status: 409 })

    const { data: recordedPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("id")
      .eq("booking_id", quote.booking_id)
      .limit(1)

    if (paymentsError) return safeSupabaseError("quotes:currency:check-payments", paymentsError)
    if ((recordedPayments ?? []).length > 0) {
      return NextResponse.json(
        {
          error: `Payments are already recorded in ${fromCurrency}, so the currency can't be changed. Remove the payments, change the currency, then record them again in ${toCurrency}.`,
          code: "PAYMENTS_RECORDED",
        },
        { status: 409 },
      )
    }
  }

  const { data: existingLines, error: linesError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order")

  if (linesError) return safeSupabaseError("quotes:currency:load-lines", linesError)

  const rate = roundFxRate(parsed.data.rate)
  const asOf = parsed.data.asOf ?? new Date().toISOString().slice(0, 10)

  const converted = (existingLines ?? []).map((line, index) => {
    const unitPrice = applyFxRate(Number(line.unit_price), rate)
    const snapshot = (line.pricing_snapshot ?? null) as PricingSnapshot | null

    return {
      description: line.description,
      supplier_description: line.supplier_description,
      qty: line.qty,
      unit_price: unitPrice,
      // Recomputed from the converted unit price rather than scaling the old total, so
      // qty x unitPrice = total still holds exactly. The grand total can therefore differ from
      // (old total x rate) by a few cents -- that is correct, not drift.
      total: roundMoney(unitPrice * line.qty),
      sort_order: index,
      pricing_snapshot: snapshot
        ? ({
            ...snapshot,
            baseUnitPrice: applyFxRate(snapshot.baseUnitPrice, rate),
            // Re-stamp the chain against the supplier's ORIGINAL currency where there was one,
            // so the internal note keeps showing what the supplier actually charges rather than
            // an intermediate ZAR figure this quote merely passed through.
            ...(snapshot.sourceCurrency && snapshot.sourceUnitPrice != null && snapshot.fxRate
              ? {
                  fxRate: roundFxRate(snapshot.fxRate * rate),
                  fxRateAsOf: asOf,
                }
              : {}),
            ...(snapshot.commission ? { commission: convertCommission(snapshot.commission, rate) } : {}),
          } satisfies PricingSnapshot as unknown as Json)
        : null,
    }
  })

  // The agent commission is a flat amount in the quote's currency, so it converts too --
  // otherwise re-pricing the quote would silently change how much discount was applied.
  const agentCommission = applyFxRate(Number(quote.agent_commission ?? 0), rate)

  // A percent discount is currency-neutral (same as a percent Commission); fixed/per_person are
  // typed rand amounts and must convert like agentCommission does, or the discount's real-world
  // size would silently change with the currency.
  const discountIsPercent = quote.discount_type === "percent"
  const discountValue = discountIsPercent
    ? Number(quote.discount_value ?? 0)
    : applyFxRate(Number(quote.discount_value ?? 0), rate)
  const discountAmount = discountIsPercent
    ? Number(quote.discount_amount ?? 0)
    : applyFxRate(Number(quote.discount_amount ?? 0), rate)

  const { subtotal, total } = calculateQuoteTotals(
    converted.map((line) => ({
      description: line.description,
      supplierDescription: line.supplier_description,
      qty: line.qty,
      unitPrice: line.unit_price,
      total: line.total,
    })),
    agentCommission,
    discountAmount,
  )

  const { error: replaceError } = await supabase.rpc("replace_quote_line_items", {
    p_quote_id: id,
    p_line_items: converted as unknown as Json,
    p_subtotal: subtotal,
    p_total: total,
  })

  if (replaceError) return safeSupabaseError("quotes:currency:replace-lines", replaceError)

  // The manual commission top-up is a flat amount in the quote's currency, so it converts too --
  // otherwise re-pricing the quote would silently change how much commission was added.
  const commissionBonus = applyFxRate(Number(quote.commission_bonus ?? 0), rate)

  const { error: updateError } = await supabase
    .from("quotes")
    .update({
      currency: toCurrency,
      commission_bonus: commissionBonus,
      agent_commission: agentCommission,
      discount_value: discountValue,
      discount_amount: discountAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updateError) return safeSupabaseError("quotes:currency:update-quote", updateError)

  // The invoices raised off a quote the client already holds move with it, at the same rate, so the
  // booking never bills in a currency the quote has left. (A provisional quote has none.)
  let invoicesConverted = 0
  let invoiceWarning: string | null = null
  let invoiceBalance: number | null = null
  if (isLive) {
    const { data: liveInvoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, amount")
      .eq("booking_id", quote.booking_id)
      .in("kind", ["deposit", "full"])
      .neq("status", "void")

    if (invoicesError) {
      invoiceWarning = "The quote was re-priced, but the invoice could not be updated. Re-issue the invoice from the Documents tab."
      console.error("quotes:currency:load-invoices", invoicesError)
    } else {
      for (const invoice of liveInvoices ?? []) {
        const { error: invoiceUpdateError } = await supabase
          .from("invoices")
          .update({
            amount: applyFxRate(Number(invoice.amount), rate),
            currency: toCurrency,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.id)

        if (invoiceUpdateError) {
          invoiceWarning =
            "The quote was re-priced, but the invoice could not be updated. Re-issue the invoice from the Documents tab."
          console.error("quotes:currency:update-invoice", invoiceUpdateError)
        } else {
          invoicesConverted += 1
        }
      }
    }

    // An accepted quote's total is what the balance is measured against.
    if (quote.status === "accepted") {
      try {
        const state = await syncBookingPaymentState(supabase, quote.booking_id, {
          actorName: profile.actorName,
          actorUserId: user.id,
        })
        invoiceBalance = state?.invoiceBalance ?? null
      } catch (error) {
        console.error("quotes:currency:balance-sync", error)
        invoiceWarning ??= "Saved, but the booking balance could not be refreshed. Reload the booking to check it."
      }
    }
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Quote",
    entityId: id,
    action: "quote_currency_changed",
    before: { currency: fromCurrency, subtotal: Number(quote.subtotal), total: Number(quote.total) },
    after: { currency: toCurrency, subtotal, total, rate, asOf, ...(isLive ? { invoicesConverted } : {}) },
  })

  return NextResponse.json({
    id,
    currency: toCurrency,
    subtotal,
    total,
    rate,
    asOf,
    lineCount: converted.length,
    ...(isLive ? { invoicesConverted, invoiceBalance, ...(invoiceWarning ? { warning: invoiceWarning } : {}) } : {}),
  })
}
