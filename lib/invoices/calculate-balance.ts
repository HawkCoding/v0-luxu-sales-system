import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { FORWARD_STAGES } from "@/lib/pipeline/validate-transition"
import type { PipelineStage } from "@/lib/types"

type QuoteBalanceRow = Pick<
  Database["public"]["Tables"]["quotes"]["Row"],
  | "id"
  | "subtotal"
  | "total"
  | "currency"
  | "status"
  | "created_at"
  | "agent_commission"
  | "discount_amount"
  | "discount_visible"
>

export interface InvoiceBalance {
  quote: QuoteBalanceRow
  quoteTotal: number
  /** VAT-exclusive value of the supply, for the tax-invoice breakdown. */
  quoteSubtotal: number
  /** Positive magnitude of the agency discount (quotes.agent_commission). Already reflected in
   *  quoteTotal — carried here only so the invoice can print it as its own line. */
  agentCommission: number
  /** Client-facing Discount (quotes.discount_amount). Already reflected in quoteTotal — carried
   *  here only so the invoice can print it as its own line, when discountVisible. */
  discount: number
  discountVisible: boolean
  /** The accepted quote's currency — an invoice is always raised in it, so the client is billed
   *  in the same currency they accepted. */
  currency: string
  totalPaid: number
  /** Date of the most recent payment, or null when nothing is paid yet. */
  lastPaymentAt: string | null
  balance: number
}

export async function calculateInvoiceBalance(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<InvoiceBalance> {
  const [{ data: acceptedQuote, error: quoteError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, subtotal, total, currency, status, created_at, agent_commission, discount_amount, discount_visible")
        .eq("booking_id", bookingId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("payments").select("amount, received_at").eq("booking_id", bookingId),
    ])

  if (quoteError) throw quoteError
  if (paymentsError) throw paymentsError

  // A stage override can move a booking past acceptance (e.g. an online booking) without the quote
  // ever being flipped to accepted. Bill the newest live quote then, matching what the invoice
  // dialog shows, instead of dead-ending the next step.
  let quote = acceptedQuote
  if (!quote) {
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("stage")
      .eq("id", bookingId)
      .maybeSingle()
    if (bookingError) throw bookingError
    // Only once the booking is actually past acceptance; before that an unaccepted quote is not billable.
    const stageIndex = FORWARD_STAGES.indexOf((booking?.stage ?? "") as PipelineStage)
    const pastAcceptance = stageIndex >= FORWARD_STAGES.indexOf("accepted")
    const { data: liveQuote, error: liveError } = pastAcceptance ? await supabase
      .from("quotes")
      .select("id, subtotal, total, currency, status, created_at, agent_commission, discount_amount, discount_visible")
      .eq("booking_id", bookingId)
      .in("status", ["sent", "draft"])
      .gt("total", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() : { data: null, error: null }
    if (liveError) throw liveError
    quote = liveQuote
  }

  if (!quote || quote.total <= 0) {
    throw new Error("A priced quote is required before generating an invoice")
  }

  const totalPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const lastPaymentAt = (payments ?? []).reduce<string | null>((latest, payment) => {
    const at = payment.received_at
    if (!at) return latest
    return latest === null || at > latest ? at : latest
  }, null)
  const balance = Math.max(0, Math.round((Number(quote.total) - totalPaid) * 100) / 100)

  return {
    quote,
    quoteTotal: Number(quote.total),
    quoteSubtotal: Number(quote.subtotal),
    agentCommission: Number(quote.agent_commission ?? 0),
    discount: Number(quote.discount_amount ?? 0),
    discountVisible: quote.discount_visible ?? true,
    currency: quote.currency,
    totalPaid,
    lastPaymentAt,
    balance,
  }
}
