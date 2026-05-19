import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"

const updateNoteSchema = z.object({
  body: z.string().trim().min(1, "Note body is required").max(5000),
})

type Params = { params: Promise<{ id: string; noteId: string }> }

function canManageNote(note: { author_id: string | null }, userId: string, role: string): boolean {
  if (note.author_id === userId) return true
  return role === "admin" || role === "manager"
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id: bookingId, noteId } = await params
  if (!bookingId || !noteId) return jsonError("Booking id and note id are required", 400)

  const { supabase, user, profile } = auth.value

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }
  const parsed = updateNoteSchema.safeParse(payload)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { data: existing, error: fetchError } = await supabase
    .from("booking_notes")
    .select("id, booking_id, author_id, body")
    .eq("id", noteId)
    .eq("booking_id", bookingId)
    .maybeSingle()
  if (fetchError) return safeSupabaseError("bookings:notes:patch:fetch", fetchError)
  if (!existing) return jsonError("Note not found", 404)

  if (!canManageNote(existing, user.id, profile.clearanceLevel)) {
    return jsonError("Forbidden", 403)
  }

  const { data: updated, error: updateError } = await supabase
    .from("booking_notes")
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select("id, booking_id, author_id, body, created_at, updated_at")
    .single()

  if (updateError || !updated) return safeSupabaseError("bookings:notes:patch:update", updateError)

  return Response.json({
    id: updated.id,
    bookingId: updated.booking_id,
    authorId: updated.author_id,
    body: updated.body,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  })
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id: bookingId, noteId } = await params
  if (!bookingId || !noteId) return jsonError("Booking id and note id are required", 400)

  const { supabase, user, profile } = auth.value

  const { data: existing, error: fetchError } = await supabase
    .from("booking_notes")
    .select("id, booking_id, author_id")
    .eq("id", noteId)
    .eq("booking_id", bookingId)
    .maybeSingle()
  if (fetchError) return safeSupabaseError("bookings:notes:delete:fetch", fetchError)
  if (!existing) return jsonError("Note not found", 404)

  if (!canManageNote(existing, user.id, profile.clearanceLevel)) {
    return jsonError("Forbidden", 403)
  }

  const { error: deleteError } = await supabase.from("booking_notes").delete().eq("id", noteId)
  if (deleteError) return safeSupabaseError("bookings:notes:delete:row", deleteError)

  return new Response(null, { status: 204 })
}
