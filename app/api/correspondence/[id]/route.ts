import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { formatCustomerSalutation } from "@/lib/person-name-format"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Load a scheduled correspondence for the dashboard send flow: the draft
 * subject/body plus booking + customer context. The actual send goes through
 * POST /api/correspondence with scheduledCorrespondenceId so the row is
 * updated in place.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params

  const { data: correspondence, error } = await supabase
    .from("correspondences")
    .select("id, booking_id, kind, status, subject, body_html, scheduled_at, recipients")
    .eq("id", id)
    .maybeSingle()

  if (error) return safeSupabaseError("correspondence:get", error)
  if (!correspondence) return jsonError("Correspondence not found", 404)

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_number, customer:customers(title, first_name, last_name, email)")
    .eq("id", correspondence.booking_id)
    .maybeSingle()

  const customer = Array.isArray(booking?.customer) ? booking?.customer[0] : booking?.customer
  const recipients = correspondence.recipients as string[] | null

  return Response.json({
    id: correspondence.id,
    bookingId: correspondence.booking_id,
    bookingNumber: booking?.booking_number ?? null,
    kind: correspondence.kind,
    status: correspondence.status,
    subject: correspondence.subject,
    bodyHtml: correspondence.body_html,
    scheduledAt: correspondence.scheduled_at,
    to: recipients?.[0] ?? customer?.email ?? "",
    customerName: formatCustomerSalutation(customer),
  })
}

const patchSchema = z.object({
  action: z.literal("dismiss"),
})

/** Dismiss a scheduled correspondence (status → cancelled) without sending. */
export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, profile, user } = auth.value
  const { id } = await params

  const { data: existing, error: fetchError } = await supabase
    .from("correspondences")
    .select("id, booking_id, status, subject")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) return safeSupabaseError("correspondence:dismiss:fetch", fetchError)
  if (!existing) return jsonError("Correspondence not found", 404)
  if (existing.status !== "scheduled") {
    return jsonError("Only scheduled correspondence can be dismissed", 409)
  }

  const { data: updated, error } = await supabase
    .from("correspondences")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("id, status")
    .single()

  if (error || !updated) return safeSupabaseError("correspondence:dismiss", error)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: existing.booking_id,
    action: "scheduled_email_dismissed",
    meta: { correspondence_id: id, subject: existing.subject },
  })

  return Response.json({ id: updated.id, status: updated.status })
}
