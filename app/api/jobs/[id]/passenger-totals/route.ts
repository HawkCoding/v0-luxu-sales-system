import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { computeLegPassengerTotals, type PassengerTotals } from "@/lib/packages/passenger-totals"

export const runtime = "nodejs"

const querySchema = z.object({
  supplierIds: z
    .string()
    .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1, "At least one supplier id is required")),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

/** Booking-level adult/child/infant totals per supplier (age buckets are supplier-scoped) — lets
 * the Apply Package dialog seed and validate per-unit passenger splits client-side. */
export async function GET(req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { supabase } = auth.value

  const parsed = querySchema.safeParse({
    supplierIds: new URL(req.url).searchParams.get("supplierIds") ?? "",
  })
  if (!parsed.success) {
    return jsonError("Invalid supplierIds query parameter", 400)
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, no_of_adults, no_of_children, child_ages")
    .eq("id", id)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("passenger-totals:load-booking", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const totalsBySupplierId: Record<string, PassengerTotals> = {}
  for (const supplierId of parsed.data.supplierIds) {
    totalsBySupplierId[supplierId] = await computeLegPassengerTotals(supabase, {
      noOfAdults: booking.no_of_adults,
      noOfChildren: booking.no_of_children,
      childAges: booking.child_ages ?? [],
      supplierId,
    })
  }

  return Response.json({ totalsBySupplierId })
}
