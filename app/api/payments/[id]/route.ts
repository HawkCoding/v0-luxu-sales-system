import { NextResponse } from "next/server"
import { createSessionClient } from "@/lib/supabase/server"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSessionClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  const updates: Record<string, unknown> = {}
  if (body.bookingId !== undefined) updates.booking_id = body.bookingId
  if (body.jobId !== undefined) updates.booking_id = body.jobId
  if (body.amount !== undefined) updates.amount = body.amount
  if (body.method !== undefined) updates.method = body.method
  if (body.reference !== undefined) updates.reference = body.reference
  if (body.notes !== undefined) updates.notes = body.notes

  const { data, error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id: data.id,
    bookingId: data.booking_id,
    amount: data.amount,
    method: data.method,
    reference: data.reference,
    notes: data.notes,
  })
}
