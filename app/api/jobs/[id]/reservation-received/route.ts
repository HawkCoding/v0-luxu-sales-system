import { requireRole } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/responses"
import { composeEmail } from "@/lib/templates/compose-email"
import { resolveSharedEmailTokens } from "@/lib/templates/resolve-shared-tokens"
import { formatCustomerSalutation } from "@/lib/person-name-format"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Prepare the reservation-received acknowledgement email (sent when the
 * client's reservation form comes back at Quote Accepted). The client shows an
 * editable preview and sends via /api/correspondence (kind: reservation_received).
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_number, consultant, assigned_salesperson_id, customer:customers(title, first_name, last_name, email)")
    .eq("id", id)
    .single()

  if (bookingError || !booking) return jsonError("Booking not found", 404)

  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer
  const customerName = formatCustomerSalutation(customer)

  const shared = await resolveSharedEmailTokens(supabase, booking.id)
  const composed = await composeEmail(supabase, "reservation_received", {
    tokens: {
      ...shared.tokens,
      customerName: customerName || "Valued Guest",
      jobNumber: booking.booking_number,
      consultantName: booking.consultant ?? "Luxus Travel & Tours",
    },
    blocks: shared.blocks,
    senderProfileId: booking.assigned_salesperson_id ?? auth.value.user.id,
  })

  if (!composed) return jsonError("Reservation-received template could not be resolved", 500)

  return Response.json({
    email: {
      to: customer?.email ?? "",
      subject: composed.subject,
      bodyHtml: composed.bodyHtml,
      bodyContentHtml: composed.bodyContentHtml,
      warnings: composed.warnings,
      signatureProfileId: composed.signatureProfileId,
      signatureBrandId: composed.signatureBrandId,
    },
  })
}
