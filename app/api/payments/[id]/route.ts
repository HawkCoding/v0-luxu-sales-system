import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"

const paymentPatchSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    amount: z.number().refine((v) => Number.isFinite(v) && v !== 0).optional(),
    receivedAt: z.string().datetime({ offset: true }).optional(),
    method: z.string().trim().min(1).max(50).optional(),
    reference: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Body must include at least one field" })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = paymentPatchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const updates: Record<string, unknown> = {}
  if (parsed.data.bookingId !== undefined) updates.booking_id = parsed.data.bookingId
  if (parsed.data.jobId !== undefined) updates.booking_id = parsed.data.jobId
  if (parsed.data.amount !== undefined) updates.amount = parsed.data.amount
  if (parsed.data.receivedAt !== undefined) updates.received_at = parsed.data.receivedAt
  if (parsed.data.method !== undefined) updates.method = parsed.data.method
  if (parsed.data.reference !== undefined) updates.reference = parsed.data.reference
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes

  const { supabase } = auth.value
  const { data, error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", id)
    .select("id, booking_id, amount, received_at, method, reference, notes")
    .single()

  if (error || !data) return safeSupabaseError("payments:update", error)

  return Response.json({
    id: data.id,
    bookingId: data.booking_id,
    jobId: data.booking_id,
    amount: data.amount,
    receivedAt: data.received_at,
    method: data.method,
    reference: data.reference,
    notes: data.notes,
  })
}
