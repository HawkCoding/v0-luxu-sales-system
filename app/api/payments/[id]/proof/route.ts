import { requireRole } from "@/lib/api/auth"
import { writeAuditLog } from "@/lib/audit-write"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"

const PROOF_BUCKET = "payment-proofs"
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
])
const SIGNED_URL_EXPIRY_SECONDS = 3600

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  const { supabase, profile, user } = auth.value

  // Verify payment exists and get booking_id for storage path
  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, booking_id")
    .eq("id", id)
    .single()

  if (fetchError || !payment) return jsonError("Payment not found", 404)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError("Invalid multipart form data", 400)
  }

  const file = formData.get("proof")
  if (!(file instanceof File)) return jsonError("proof file is required", 400)

  if (file.size > MAX_FILE_SIZE) {
    return jsonError("File exceeds maximum allowed size of 10 MB", 400)
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return jsonError(
      `Unsupported file type '${file.type}'. Allowed: JPEG, PNG, WebP, PDF`,
      400,
    )
  }

  const ext = file.name.split(".").pop() ?? "bin"
  const storagePath = `${payment.booking_id}/${id}/proof.${ext}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(PROOF_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return safeSupabaseError("payments:proof:upload", uploadError)

  const { error: updateError } = await supabase
    .from("payments")
    .update({ proof_storage_path: storagePath })
    .eq("id", id)

  if (updateError) return safeSupabaseError("payments:proof:update", updateError)

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Payment",
    entity_id: id,
    action: "payment_proof_uploaded",
    meta_json: { storage_path: storagePath, file_name: file.name, file_size: file.size },
  })

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Payment",
    entityId: id,
    action: "attachment_uploaded",
    meta: { storage_path: storagePath, file_name: file.name, file_size: file.size, attachment_kind: "payment_proof" },
  })

  return Response.json({ storagePath })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  const { supabase } = auth.value

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, proof_storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !payment) return jsonError("Payment not found", 404)
  if (!payment.proof_storage_path) return jsonError("No proof file uploaded for this payment", 404)

  const { data: signedData, error: signError } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrl(payment.proof_storage_path, SIGNED_URL_EXPIRY_SECONDS)

  if (signError || !signedData) return safeSupabaseError("payments:proof:sign", signError)

  return Response.json({ signedUrl: signedData.signedUrl })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "manager"])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) return jsonError("Payment id is required", 400)

  const { supabase, profile, user } = auth.value

  const { data: payment, error: fetchError } = await supabase
    .from("payments")
    .select("id, proof_storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !payment) return jsonError("Payment not found", 404)
  if (!payment.proof_storage_path) return jsonError("No proof file to delete", 404)

  const { error: removeError } = await supabase.storage
    .from(PROOF_BUCKET)
    .remove([payment.proof_storage_path])

  if (removeError) return safeSupabaseError("payments:proof:remove", removeError)

  const { error: updateError } = await supabase
    .from("payments")
    .update({ proof_storage_path: null })
    .eq("id", id)

  if (updateError) return safeSupabaseError("payments:proof:clear", updateError)

  await supabase.from("audit_logs").insert({
    actor: profile.actorName,
    actor_user_id: user.id,
    entity_type: "Payment",
    entity_id: id,
    action: "payment_proof_deleted",
    meta_json: { storage_path: payment.proof_storage_path },
  })

  return new Response(null, { status: 204 })
}
