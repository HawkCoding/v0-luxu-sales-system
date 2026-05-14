import { requireRole } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/responses"
import { checkVoucherReadiness } from "@/lib/voucher/check-readiness"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get("jobId")
  if (!jobId) return jsonError("jobId query parameter is required", 400)

  const { supabase } = auth.value

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, stage, invoice_balance, departure_date, customer:customers(email)")
    .eq("id", jobId)
    .single()

  if (error || !booking) return jsonError("Booking not found", 404)

  const customer = Array.isArray(booking.customer) ? booking.customer[0] : booking.customer

  return Response.json(
    checkVoucherReadiness({
      stage: booking.stage,
      invoiceBalance: booking.invoice_balance,
      departureDate: booking.departure_date,
      customerEmail: customer?.email ?? null,
    }),
  )
}
