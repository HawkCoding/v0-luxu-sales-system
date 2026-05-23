import { requireRole, requireUser } from "@/lib/api/auth"
import { writeAuditLog } from "@/lib/audit-write"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"

const ATTACHMENTS_BUCKET = "attachments"
const PAYMENT_PROOFS_BUCKET = "payment-proofs"
const SIGNED_URL_EXPIRY_SECONDS = 3600

function bucketForPath(path: string, kind: string): string {
  // Legacy payment-proof rows (created before the attachments bucket) live at
  // `{booking_id}/{payment_id}/proof.{ext}` in the payment-proofs bucket.
  // New uploads (all kinds, including proof_of_payment via /api/documents/upload)
  // live at `{booking_id}/{kind}/...` in the attachments bucket.
  if (kind === "proof_of_payment" && !path.includes("/proof_of_payment/")) {
    return PAYMENT_PROOFS_BUCKET
  }
  return ATTACHMENTS_BUCKET
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Document id is required", 400)

  const { supabase } = auth.value

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, booking_id, kind, storage_path, file_name")
    .eq("id", id)
    .maybeSingle()

  if (error) return safeSupabaseError("documents:get:fetch", error)
  if (!doc) return jsonError("Document not found", 404)
  if (!doc.storage_path) return jsonError("Document has no stored file", 404)

  const bucket = bucketForPath(doc.storage_path, doc.kind)
  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(doc.storage_path, SIGNED_URL_EXPIRY_SECONDS)

  if (signError || !signed) return safeSupabaseError("documents:get:sign", signError)

  return Response.json({
    id: doc.id,
    fileName: doc.file_name,
    kind: doc.kind,
    signedUrl: signed.signedUrl,
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Document id is required", 400)

  const { supabase, profile, user } = auth.value

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("id, booking_id, kind, storage_path, file_name, payment_id")
    .eq("id", id)
    .maybeSingle()

  if (fetchError) return safeSupabaseError("documents:delete:fetch", fetchError)
  if (!doc) return jsonError("Document not found", 404)

  if (doc.storage_path) {
    const bucket = bucketForPath(doc.storage_path, doc.kind)
    const { error: removeError } = await supabase.storage.from(bucket).remove([doc.storage_path])
    if (removeError) return safeSupabaseError("documents:delete:remove", removeError)
  }

  const { error: deleteError } = await supabase.from("documents").delete().eq("id", id)
  if (deleteError) return safeSupabaseError("documents:delete:row", deleteError)

  if (doc.kind === "proof_of_payment" && doc.payment_id) {
    await supabase
      .from("payments")
      .update({ proof_storage_path: null })
      .eq("id", doc.payment_id)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: doc.booking_id,
    action: "attachment_deleted",
    before: {
      document_id: doc.id,
      kind: doc.kind,
      file_name: doc.file_name,
      storage_path: doc.storage_path,
    },
  })

  return new Response(null, { status: 204 })
}
