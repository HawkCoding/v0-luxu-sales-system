import { z } from "zod"
import { requireRole, requireUser } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"

const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Note body is required").max(5000),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id: bookingId } = await params
  if (!bookingId) return jsonError("Booking id is required", 400)

  const { supabase } = auth.value

  const { data, error } = await supabase
    .from("booking_notes")
    .select("id, booking_id, author_id, body, created_at, updated_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })

  if (error) return safeSupabaseError("bookings:notes:list", error)

  const authorIds = Array.from(new Set((data ?? []).map((n) => n.author_id).filter((v): v is string => Boolean(v))))
  let authorMap: Record<string, { name: string; email: string | null }> = {}
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, surname, email")
      .in("user_id", authorIds)
    authorMap = Object.fromEntries(
      (profiles ?? []).map((p) => [
        p.user_id,
        {
          name: [p.name, p.surname].filter(Boolean).join(" ").trim() || p.email || "Unknown",
          email: p.email,
        },
      ]),
    )
  }

  const notes = (data ?? []).map((n) => ({
    id: n.id,
    bookingId: n.booking_id,
    authorId: n.author_id,
    authorName: n.author_id ? authorMap[n.author_id]?.name ?? "Unknown" : "Unknown",
    body: n.body,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }))

  return Response.json({ notes })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id: bookingId } = await params
  if (!bookingId) return jsonError("Booking id is required", 400)

  const { supabase, user } = auth.value

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }
  const parsed = createNoteSchema.safeParse(payload)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle()
  if (bookingError) return safeSupabaseError("bookings:notes:bookingFetch", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const { data: inserted, error: insertError } = await supabase
    .from("booking_notes")
    .insert({
      booking_id: bookingId,
      author_id: user.id,
      body: parsed.data.body,
    })
    .select("id, booking_id, author_id, body, created_at, updated_at")
    .single()

  if (insertError || !inserted) return safeSupabaseError("bookings:notes:insert", insertError)

  return Response.json(
    {
      id: inserted.id,
      bookingId: inserted.booking_id,
      authorId: inserted.author_id,
      body: inserted.body,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    },
    { status: 201 },
  )
}
