import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { composeFromTemplate } from "@/lib/templates/compose-email"
import { getSampleTokens } from "@/lib/templates/registry"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { firstRecord } from "@/lib/utils"

const previewSchema = z.object({
  key: z.string().min(1).max(120),
  subject: z.string().max(500),
  bodyHtml: z.string().max(200_000),
  bookingId: z.string().uuid().optional(),
})

// Render a full branded preview of a template using the registry's sample
// token values, so managers see what the customer will receive — including
// warnings for tokens the send flow will not supply.
export async function POST(req: Request) {
  // Mirrors "view:templates" — a preview renders template content, so it needs
  // the same gate as GET /api/templates.
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = previewSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { key, subject, bodyHtml, bookingId } = parsed.data
  const sample = getSampleTokens(key)
  const supabase = auth.value.supabase

  let source: { bookingNumber: string; customerName: string } | null = null
  let tokens = sample.tokens
  let blocks = sample.blocks

  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("booking_number, customer:customers(title, first_name, last_name)")
      .eq("id", bookingId)
      .maybeSingle()
    if (!booking) return jsonError("Booking not found", 404)

    const shared = await resolveSharedEmailTokens(supabase, bookingId)
    tokens = { ...sample.tokens, ...shared.tokens }
    blocks = { ...sample.blocks, ...shared.blocks }
    source = {
      bookingNumber: booking.booking_number,
      customerName: formatCustomerSalutation(firstRecord(booking.customer)),
    }
  } else if (sample.tokens.supplierName) {
    // Sample values are static, so the supplier token would otherwise show a
    // spelling that exists nowhere in Suppliers. Preview with a real record so
    // managers see the exact name, spacing and capitalisation customers get.
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("name")
      .eq("kind", "train_operator")
      .eq("active", true)
      .order("name")
      .limit(1)
      .maybeSingle()
    if (supplier?.name) tokens = { ...tokens, supplierName: supplier.name }
  }

  const composed = await composeFromTemplate(
    { subject, bodyHtml },
    { tokens, blocks, senderProfileId: auth.value.user.id },
  )

  return Response.json({
    subject: composed.subject,
    html: composed.bodyHtml,
    warnings: composed.warnings,
    source,
  })
}
