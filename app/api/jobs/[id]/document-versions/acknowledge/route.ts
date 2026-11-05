import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import { writeAuditLog } from "@/lib/audit-write"
import { computeContentFingerprint } from "@/lib/documents/content-fingerprint"
import type { IssuedDocumentType } from "@/lib/documents/document-versions"

export const runtime = "nodejs"

const bookingIdSchema = z.string().uuid()

const bodySchema = z.object({
  versionId: z.string().uuid(),
})

/**
 * "Leave as is": the salesperson has looked at a sent document the booking has since moved on from
 * and decided the client does not need an updated one. The decision is recorded against the booking
 * as it is right now, so the "Changed since sent" flag clears but returns if the booking changes
 * again. Nothing is generated, sent or moved.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = bookingIdSchema.safeParse(id)
  if (!parsedId.success) return jsonError("Invalid booking id", 400)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError("Invalid JSON body", 400)
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return jsonZodError(parsed.error)

  const { supabase, user, profile } = auth.value
  const bookingId = parsedId.data

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .select("id, booking_id, doc_type, quote_id, invoice_id")
    .eq("id", parsed.data.versionId)
    .maybeSingle()

  if (versionError) return safeSupabaseError("document-versions:acknowledge:version", versionError)
  if (!version || version.booking_id !== bookingId) return jsonError("Document not found", 404)

  let fingerprint: string
  try {
    fingerprint = await computeContentFingerprint(supabase, {
      bookingId,
      docType: version.doc_type as IssuedDocumentType,
      quoteId: version.quote_id,
      invoiceId: version.invoice_id,
    })
  } catch (error) {
    return safeSupabaseError("document-versions:acknowledge:fingerprint", error)
  }

  const { error: insertError } = await supabase.from("document_version_acknowledgements").insert({
    document_version_id: version.id,
    booking_id: bookingId,
    fingerprint,
    acknowledged_by: user.id,
  })

  if (insertError) return safeSupabaseError("document-versions:acknowledge:insert", insertError)

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: bookingId,
    action: "document_change_acknowledged",
    after: { doc_type: version.doc_type, document_version_id: version.id },
  })

  return Response.json({ ok: true })
}
