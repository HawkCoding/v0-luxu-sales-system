import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { safeSupabaseError } from "@/lib/api/responses"
import { calculateQuoteTotals, roundMoney } from "@/lib/quotes/pricing-engine"
import { applyFxRate, roundFxRate } from "@/lib/pricing/convert-currency"
import { normaliseCurrency } from "@/lib/money"
import { SUPPORTED_CURRENCY_VALUES } from "@/lib/types"
import type { PricingSnapshot } from "@/lib/types"
import type { Json } from "@/lib/supabase/types"
import { writeAuditLog } from "@/lib/audit-write"

/**
 * Re-denominates a DRAFT quote into another currency.
 *
 * A sent or accepted quote is deliberately NOT converted in place: the client is holding a
 * document that says one number in one currency, and any invoice raised off it agrees with that
 * document. Changing it underneath them would make all three disagree. Those statuses are
 * rejected here and the UI routes the salesperson to Revise instead, which creates a new version
 * and leaves the original's record intact.
 */

const CONVERTIBLE_STATUSES = ["draft", "pricing_incomplete"]

const postSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCY_VALUES),
  /** Multiplier from the quote's current currency to the target. Bounded so a mistyped decimal
   *  point cannot silently re-price a booking by an order of magnitude. */
  rate: z.number().positive().max(10_000),
  /** The rate's publication date, stamped onto each line for the internal provenance note. */
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})

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
    .select("id, booking_id, currency, status, subtotal, total, commission_bonus, agent_commission")
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

  if (!CONVERTIBLE_STATUSES.includes(quote.status)) {
    return NextResponse.json(
      {
        error:
          quote.status === "accepted"
            ? "An accepted quote can't be re-priced in another currency. Use Revise to create a new version."
            : "A quote that has been sent can't be re-priced in another currency. Use Revise to create a new version.",
        // Lets the dialog offer the Revise hand-off rather than just showing a dead end.
        code: "REQUIRES_REVISION",
      },
      { status: 409 },
    )
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
          } satisfies PricingSnapshot as unknown as Json)
        : null,
    }
  })

  // The agent commission is a flat amount in the quote's currency, so it converts too --
  // otherwise re-pricing the quote would silently change how much discount was applied.
  const agentCommission = applyFxRate(Number(quote.agent_commission ?? 0), rate)

  const { subtotal, total } = calculateQuoteTotals(
    converted.map((line) => ({
      description: line.description,
      supplierDescription: line.supplier_description,
      qty: line.qty,
      unitPrice: line.unit_price,
      total: line.total,
    })),
    agentCommission,
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (updateError) return safeSupabaseError("quotes:currency:update-quote", updateError)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Quote",
    entityId: id,
    action: "quote_currency_changed",
    before: { currency: fromCurrency, subtotal: Number(quote.subtotal), total: Number(quote.total) },
    after: { currency: toCurrency, subtotal, total, rate, asOf },
  })

  return NextResponse.json({
    id,
    currency: toCurrency,
    subtotal,
    total,
    rate,
    asOf,
    lineCount: converted.length,
  })
}
