import { NextResponse } from "next/server"
import { z } from "zod"
import { createSessionClient } from "@/lib/supabase/server"
import { ALL_ROLES } from "@/lib/permissions"

const allowedRoles = new Set<string>(ALL_ROLES)
const PRECHECK_MAX_EMAILS = 10000
const requestSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().email().max(255)).min(1).max(PRECHECK_MAX_EMAILS),
  routeId: z.string().uuid().nullable().optional(),
})

const CUSTOMER_EMAIL_BATCH_SIZE = 100
const BOOKING_ID_BATCH_SIZE = 100

export async function POST(req: Request) {
  const supabase = await createSessionClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("clearance_level")
    .eq("user_id", user.id)
    .single()

  if (profileError || !profile || !allowedRoles.has(profile.clearance_level))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let parsed: z.infer<typeof requestSchema>
  try {
    parsed = requestSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const uniqueEmails = Array.from(new Set(parsed.emails.map((email) => email.trim().toLowerCase())))
  const existingRows: Array<{ id: string; email: string }> = []

  for (let index = 0; index < uniqueEmails.length; index += CUSTOMER_EMAIL_BATCH_SIZE) {
    const emailBatch = uniqueEmails.slice(index, index + CUSTOMER_EMAIL_BATCH_SIZE)
    const { data, error } = await supabase.from("customers").select("id, email").in("email", emailBatch)
    if (error) return NextResponse.json({ error: "Failed to check existing customers" }, { status: 500 })
    existingRows.push(...(data ?? []))
  }

  const existingByEmail = new Map<string, string>()
  existingRows.forEach((row) => {
    existingByEmail.set(row.email.toLowerCase(), row.id)
  })

  const customerIds = Array.from(new Set(existingRows.map((row) => row.id)))
  const hasHistoricalRouteBookingByCustomerId = new Set<string>()

  if (parsed.routeId && customerIds.length > 0) {
    for (let index = 0; index < customerIds.length; index += BOOKING_ID_BATCH_SIZE) {
      const customerIdBatch = customerIds.slice(index, index + BOOKING_ID_BATCH_SIZE)
      const { data, error } = await supabase
        .from("bookings")
        .select("customer_id, extracted_json")
        .in("customer_id", customerIdBatch)
        .eq("route_id", parsed.routeId)
        .eq("stage", "closed")

      if (error) return NextResponse.json({ error: "Failed to check existing bookings" }, { status: 500 })

      ;(data ?? []).forEach((booking) => {
        const importedVia = (booking.extracted_json as { historical_import?: { imported_via?: string } } | null)
          ?.historical_import?.imported_via
        if (importedVia === "supplier_csv") hasHistoricalRouteBookingByCustomerId.add(booking.customer_id)
      })
    }
  }

  return NextResponse.json({
    existing: uniqueEmails
      .filter((email) => existingByEmail.has(email))
      .map((email) => {
        const customerId = existingByEmail.get(email) ?? ""
        return {
          email,
          hasRouteBooking: customerId ? hasHistoricalRouteBookingByCustomerId.has(customerId) : false,
        }
      }),
  })
}
