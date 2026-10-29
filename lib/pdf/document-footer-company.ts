import type { SupabaseClient } from "@supabase/supabase-js"
import { getPaymentMethod } from "@/lib/payment-methods"
import { footerCompanyFromBanking, type DocumentFooterCompany } from "@/lib/pdf/sarail-design"
import type { Database } from "@/lib/supabase/types"

/**
 * The company details every PDF's first-page footer prints (quote, voucher, itinerary): the default
 * payment method's company fields, the same ones the invoice has always carried. Never throws — a
 * footer lookup must not stop a client document from rendering; it degrades to the brand lines.
 */
export async function loadDocumentFooterCompany(supabase: SupabaseClient<Database>): Promise<DocumentFooterCompany> {
  try {
    const { banking } = await getPaymentMethod(supabase, null)
    return footerCompanyFromBanking(banking)
  } catch {
    return {}
  }
}
