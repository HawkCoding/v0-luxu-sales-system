import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { buildBankingDetailsBlock } from "@/lib/invoices/banking-details-block"
import { getPaymentMethod } from "@/lib/payment-methods"

const bodySchema = z.object({
  paymentMethodId: z.string().uuid().nullish(),
  invoiceNumber: z.string().trim().max(120).optional().default(""),
})

/**
 * Renders a {{bankingDetails}} block fragment on demand so the send dialog
 * can swap payment methods without re-composing the whole email. Calls the
 * same buildBankingDetailsBlock that compose uses, so the swapped-in block
 * is byte-identical to what was originally embedded.
 */
export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error, "Invalid input")

  const { supabase } = auth.value
  const method = await getPaymentMethod(supabase, parsed.data.paymentMethodId)
  const html = buildBankingDetailsBlock(method.banking, parsed.data.invoiceNumber)

  return Response.json({ html, paymentMethodId: method.id || null, paymentMethodName: method.name })
}
