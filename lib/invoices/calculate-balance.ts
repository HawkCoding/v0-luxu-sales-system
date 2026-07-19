import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type QuoteBalanceRow = Pick<
  Database["public"]["Tables"]["quotes"]["Row"],
  "id" | "subtotal" | "vat" | "total" | "status" | "created_at"
>

export interface InvoiceBalance {
  quote: QuoteBalanceRow
  quoteTotal: number
  /** VAT-exclusive value of the supply, for the tax-invoice breakdown. */
  quoteSubtotal: number
  quoteVat: number
  totalPaid: number
  /** Date of the most recent payment, or null when nothing is paid yet. */
  lastPaymentAt: string | null
  balance: number
}

export async function calculateInvoiceBalance(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<InvoiceBalance> {
  const [{ data: quote, error: quoteError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, subtotal, vat, total, status, created_at")
        .eq("booking_id", bookingId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("payments").select("amount, received_at").eq("booking_id", bookingId),
    ])

  if (quoteError) throw quoteError
  if (paymentsError) throw paymentsError
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
    quoteVat: Number(quote.vat),
    totalPaid,
    lastPaymentAt,
    balance,
  }
}
