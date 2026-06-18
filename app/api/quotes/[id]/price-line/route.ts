import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { priceExtraLineItems } from "@/lib/quotes/price-extra-line"

const priceLineSchema = z.object({
  supplierId: z.string().uuid(),
  routeId: z.string().uuid(),
  suiteTypeId: z.string().uuid(),
  direction: z.enum(["outbound", "return", "round_trip"]).optional(),
  quantity: z.number().int().positive().optional(),
  rateTypeId: z.string().uuid().optional(),
  commissionOverride: z
    .object({
      type: z.enum(["percent", "per_person"]),
      value: z.number().finite().nonnegative(),
    })
    .nullable()
    .optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id: quoteId } = await params

  let parsed: z.infer<typeof priceLineSchema>
  try {
    parsed = priceLineSchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .select("id, booking_id")
    .eq("id", quoteId)
    .single()
  if (quoteError || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 })
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("departure_date")
    .eq("id", quote.booking_id)
    .single()
  const travelDate = booking?.departure_date ?? new Date().toISOString().slice(0, 10)

  const { data: rateTypeRows } = await supabase
    .from("rate_types")
    .select("id, is_default")
    .is("archived_at", null)
  const fallbackRateTypeId = (rateTypeRows ?? []).find((rt) => rt.is_default)?.id ?? null

  try {
    const { lineItems } = await priceExtraLineItems({
      supabase,
      jobId: quote.booking_id,
      travelDate,
      fallbackRateTypeId,
      ...parsed,
    })
    return NextResponse.json({ lineItems })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to price line"
    const status = message === "Job not found" ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
