import { z } from "zod"
import { requireRole } from "@/lib/api/auth"
import { writeAuditLog } from "@/lib/audit-write"
import { jsonError, jsonZodError, safeSupabaseError } from "@/lib/api/responses"
import {
  getAttachmentAllowedMimeTypes,
  getAttachmentMaxSizeMb,
} from "@/lib/settings-access"

const ATTACHMENTS_BUCKET = "attachments"
const SIGNED_URL_EXPIRY_SECONDS = 3600

const DOCUMENT_KINDS = [
  "quote_pdf",
  "invoice_pdf",
  "voucher_pdf",
  "summary_pdf",
  "proof_of_payment",
  "other",
] as const

const uploadFieldsSchema = z.object({
  booking_id: z.string().uuid(),
  kind: z.enum(DOCUMENT_KINDS),
})

function sanitiseFileName(name: string): string {
  const trimmed = name.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "")
  return trimmed.length > 0 ? trimmed.slice(0, 120) : "file"
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, profile, user } = auth.value

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError("Invalid multipart form data", 400)
  }

  const parsedFields = uploadFieldsSchema.safeParse({
    booking_id: formData.get("booking_id"),
    kind: formData.get("kind"),
  })
  if (!parsedFields.success) return jsonZodError(parsedFields.error)

  const { booking_id: bookingId, kind } = parsedFields.data

  const file = formData.get("file")
  if (!(file instanceof File)) return jsonError("file is required", 400)

  const fileName = file.name?.trim()
  if (!fileName) return jsonError("file name is required", 400)

  const [maxSizeMb, allowedMimes] = await Promise.all([
    getAttachmentMaxSizeMb(supabase),
    getAttachmentAllowedMimeTypes(supabase),
  ])
  const maxBytes = maxSizeMb * 1024 * 1024

  if (file.size > maxBytes) {
    return jsonError(`File exceeds maximum allowed size of ${maxSizeMb} MB`, 400)
  }

  if (!allowedMimes.includes(file.type)) {
    return jsonError(
      `Unsupported file type '${file.type}'. Allowed: ${allowedMimes.join(", ")}`,
      400,
      { allowedMimeTypes: allowedMimes },
    )
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle()

  if (bookingError) return safeSupabaseError("documents:upload:bookingFetch", bookingError)
  if (!booking) return jsonError("Booking not found", 404)

  const storagePath = `${bookingId}/${kind}/${crypto.randomUUID()}-${sanitiseFileName(fileName)}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return safeSupabaseError("documents:upload:storage", uploadError)

  const { data: inserted, error: insertError } = await supabase
    .from("documents")
    .insert({
      booking_id: bookingId,
      kind,
      status: "received",
      storage_path: storagePath,
      file_name: fileName,
      uploaded_by: user.id,
    })
    .select("id")
    .single()

  if (insertError || !inserted) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => undefined)
    return safeSupabaseError("documents:upload:insert", insertError)
  }

  await writeAuditLog(supabase, {
    actor: profile.actorName,
    actorUserId: user.id,
    entityType: "Booking",
    entityId: bookingId,
    action: "attachment_uploaded",
    meta: {
      document_id: inserted.id,
      kind,
      file_name: fileName,
      file_size: file.size,
    },
  })

  const { data: signed, error: signError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS)

  if (signError || !signed) return safeSupabaseError("documents:upload:sign", signError)

  return Response.json({
    id: inserted.id,
    fileName,
    kind,
    signedUrl: signed.signedUrl,
  })
}
