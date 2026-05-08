import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type QuoteBalanceRow = Pick<
  Database["public"]["Tables"]["quotes"]["Row"],
  "id" | "total" | "status" | "created_at"
>

export interface InvoiceBalance {
  quote: QuoteBalanceRow
  quoteTotal: number
  totalPaid: number
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
        .select("id, total, status, created_at")
        .eq("booking_id", bookingId)
        .in("status", ["sent", "accepted", "ready", "draft"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("payments").select("amount").eq("booking_id", bookingId),
    ])

  if (quoteError) throw quoteError
  if (paymentsError) throw paymentsError
  if (!quote || quote.total <= 0) {
    throw new Error("A priced quote is required before generating a final invoice")
  }

  const totalPaid = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const balance = Math.max(0, Math.round((Number(quote.total) - totalPaid) * 100) / 100)

  return {
    quote,
    quoteTotal: Number(quote.total),
    totalPaid,
    balance,
  }
}
