import { z } from "zod"
import { requireAnyRole } from "@/lib/api/auth"
import { jsonError, jsonZodError } from "@/lib/api/responses"
import { formatCustomerSalutation } from "@/lib/person-name-format"
import { formatDisplayDate } from "@/lib/date-format"
import { firstRecord } from "@/lib/utils"

const searchSchema = z.object({ q: z.string().trim().max(120).optional() })

export interface BookingSearchResult {
  id: string
  bookingNumber: string
  customerName: string
  departureDate: string | null
}

// Powers the Templates-page preview picker: find a real booking to render a
// template preview against, so admins see actual data instead of the static
// sample. Mirrors GET /api/customers' search pattern.
export async function GET(request: Request) {
  const auth = await requireAnyRole()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const parsed = searchSchema.safeParse({ q: searchParams.get("q") ?? undefined })
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase } = auth.value
  const query = parsed.data.q

  let customerIds: string[] | null = null
  if (query) {
    const escaped = query.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id")
      .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
      .limit(50)

    if (customersError) return jsonError("Failed to search customers", 500)
    customerIds = (customers ?? []).map((c) => c.id)
  }

  let bookingQuery = supabase
    .from("bookings")
    .select("id, booking_number, departure_date, customer:customers(title, first_name, last_name)")
    .order("updated_at", { ascending: false })
    .limit(20)

  if (query) {
    const escaped = query.replaceAll(",", " ").replaceAll("%", "\\%").replaceAll("_", "\\_")
    const clauses = [`booking_number.ilike.%${escaped}%`]
    if (customerIds && customerIds.length > 0) clauses.push(`customer_id.in.(${customerIds.join(",")})`)
    bookingQuery = bookingQuery.or(clauses.join(","))
  }

  const { data, error } = await bookingQuery
  if (error) return jsonError("Failed to search bookings", 500)

  const bookings: BookingSearchResult[] = (data ?? []).map((booking) => ({
    id: booking.id,
    bookingNumber: booking.booking_number,
    customerName: formatCustomerSalutation(firstRecord(booking.customer)),
    departureDate: booking.departure_date ? formatDisplayDate(booking.departure_date) : null,
  }))

  return Response.json({ bookings })
}
