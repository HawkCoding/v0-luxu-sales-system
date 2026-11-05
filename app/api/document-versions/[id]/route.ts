import { z } from "zod"
import { requireUser } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { DOCUMENT_VERSIONS_BUCKET } from "@/lib/documents/document-versions"

const SIGNED_URL_EXPIRY_SECONDS = 3600

const idSchema = z.string().uuid()

/**
 * A short-lived link to the stored copy of an issued document. The file is the exact PDF that was
 * attached to the email, never a fresh render, so it still matches what the client received after
 * the booking has changed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return jsonError("Invalid document id", 400)

  const { supabase } = auth.value

  const { data: version, error } = await supabase
    .from("document_versions")
    .select("id, storage_path, file_name")
    .eq("id", parsedId.data)
    .maybeSingle()

  if (error) return safeSupabaseError("document-versions:get", error)
  if (!version) return jsonError("Document not found", 404)

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_VERSIONS_BUCKET)
    .createSignedUrl(version.storage_path, SIGNED_URL_EXPIRY_SECONDS, { download: version.file_name })

  if (signError || !signed) return safeSupabaseError("document-versions:sign", signError)

  return Response.json({ id: version.id, fileName: version.file_name, signedUrl: signed.signedUrl })
}
