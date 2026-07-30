import { NextResponse } from "next/server"
import { requireRole, type ApiAuthContext } from "@/lib/api/auth"
import { reviseQuoteNumber } from "@/lib/quotes/quote-number"
import { applyRevisionReset, planRevisionReset, type RevisionResetPlan } from "@/lib/quotes/revision-reset"
import type { PipelineStage } from "@/lib/types"

interface RouteParams {
  params: Promise<{ id: string }>
}

/** A quote can only be revised once it has left the drafting stage. */
const REVISABLE_STATUSES = ["sent", "accepted", "expired"]

interface RevisionContext {
  bookingId: string
  bookingNumber: string
  stage: PipelineStage
  plan: RevisionResetPlan
}

async function loadRevisionContext(
  supabase: ApiAuthContext["supabase"],
  quoteId: string,
): Promise<{ context: RevisionContext } | { response: NextResponse }> {
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, status, booking_id")
    .eq("id", quoteId)
    .single()

  if (quoteError || !quote) {
    return { response: NextResponse.json({ error: "Quote not found" }, { status: 404 }) }
  }

  if (!REVISABLE_STATUSES.includes(quote.status)) {
    return {
      response: NextResponse.json(
        { error: "Only sent, accepted, or expired quotes can be revised" },
        { status: 400 },
      ),
    }
  }

  const [{ data: booking, error: bookingError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id, booking_number, stage, deposit_paid, deposit_confirmed_manually, outcome")
        .eq("id", quote.booking_id)
        .single(),
      supabase.from("payments").select("amount").eq("booking_id", quote.booking_id),
    ])

  if (bookingError || !booking) {
    return { response: NextResponse.json({ error: "Booking not found" }, { status: 404 }) }
  }
  if (paymentsError) {
    return { response: NextResponse.json({ error: "Failed to load payments" }, { status: 500 }) }
  }

  const totalPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const stage = booking.stage as PipelineStage

  return {
    context: {
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      stage,
      plan: planRevisionReset({
        stage,
        depositPaid: booking.deposit_paid || booking.deposit_confirmed_manually,
        totalPaid,
        outcome: booking.outcome,
      }),
    },
  }
}

/** Read-only preview of what a revision would reset, for the confirmation dialog. */
export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const loaded = await loadRevisionContext(auth.value.supabase, id)
  if ("response" in loaded) return loaded.response

  return NextResponse.json({ plan: loaded.context.plan })
}

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  const loaded = await loadRevisionContext(supabase, id)
  if ("response" in loaded) return loaded.response
  const { bookingId, bookingNumber, stage, plan } = loaded.context

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", id)
    .single()

  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("quote_line_items")
    .select("description, supplier_description, qty, unit_price, total, sort_order, pricing_snapshot")
    .eq("quote_id", id)
    .order("sort_order", { ascending: true })

  if (lineItemsError) {
    return NextResponse.json({ error: "Failed to load quote line items" }, { status: 500 })
  }

  const quoteNumber = reviseQuoteNumber(quote.quote_number, bookingNumber)
  const { data: revisedQuote, error: insertError } = await supabase
    .from("quotes")
    .insert({
      booking_id: quote.booking_id,
      itinerary_id: quote.itinerary_id,
      status: "draft",
      validity_until: quote.validity_until,
      subtotal: quote.subtotal,
      total: quote.total,
      commission_bonus: quote.commission_bonus,
      quote_number: quoteNumber,
      parent_quote_id: quote.id,
    })
    .select()
    .single()

  if (insertError || !revisedQuote) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to revise quote" },
      { status: 500 },
    )
  }

  if (lineItems && lineItems.length > 0) {
    const { error: copyError } = await supabase.from("quote_line_items").insert(
      lineItems.map((item) => ({
        quote_id: revisedQuote.id,
        description: item.description,
        supplier_description: item.supplier_description,
        qty: item.qty,
        unit_price: item.unit_price,
        total: item.total,
        sort_order: item.sort_order,
        pricing_snapshot: item.pricing_snapshot,
      })),
    )

    if (copyError) {
      return NextResponse.json({ error: "Failed to copy quote line items" }, { status: 500 })
    }
  }

  // Rewind the pipeline so the salesperson re-walks send → accept → deposit
  // against the revised numbers, and void the invoices built off the old total.
  let reset
  try {
    reset = await applyRevisionReset(supabase, {
      bookingId,
      parentQuoteId: quote.id,
      plan,
      fromStage: stage,
      actorName: profile.actorName,
      actorUserId: user.id,
    })
  } catch (error) {
    console.error("quote-revise:reset", error)
    return NextResponse.json({ error: "Quote revised but the pipeline reset failed" }, { status: 500 })
  }

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Quote",
    entity_id: revisedQuote.id,
    action: "quote_revised",
    before_json: { parent_quote_id: quote.id, quote_number: quote.quote_number },
    after_json: { quote_number: quoteNumber },
  })

  return NextResponse.json({
    id: revisedQuote.id,
    jobId: revisedQuote.booking_id,
    bookingId: revisedQuote.booking_id,
    status: revisedQuote.status,
    quoteNumber: revisedQuote.quote_number,
    parentQuoteId: revisedQuote.parent_quote_id,
    reset: {
      targetStage: plan.targetStage,
      stageChanged: reset.stageChanged,
      keptDeposit: plan.keepsDeposit,
      voidedInvoiceCount: reset.voidedInvoiceIds.length,
      reopenedInvoiceCount: reset.reopenedInvoiceIds.length,
      summary: plan.summary,
    },
  })
}
