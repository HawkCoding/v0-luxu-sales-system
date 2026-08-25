import { requireRole } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { ensureQuotePdf, QUOTE_BUCKET } from "@/lib/quotes/ensure-quote-pdf"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireRole(["admin", "manager", "consultant"])
  if (!auth.ok) return auth.response

  const { supabase, user, profile } = auth.value
  const { id } = await params

  let ensured
  try {
    ensured = await ensureQuotePdf(supabase, id, {
      actorName: profile.actorName,
      actorUserId: user.id,
      force: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quote PDF could not be generated"
    if (message === "Quote not found") return jsonError(message, 404)
    if (message.startsWith("Journey length not recorded")) return jsonError(message, 409)
    console.error("quote-pdf:ensure", err)
    return jsonError(message, 500)
  }

  const objectPath = ensured.storagePath.startsWith(`${QUOTE_BUCKET}/`)
    ? ensured.storagePath.slice(QUOTE_BUCKET.length + 1)
    : ensured.storagePath

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(QUOTE_BUCKET)
    .createSignedUrl(objectPath, 3600)

  if (signedUrlError) {
    return safeSupabaseError("quote-pdf:signed-url", signedUrlError)
  }

  return Response.json({
    document: {
      id: ensured.documentId,
      bookingId: ensured.bookingId,
      kind: "quote_pdf",
      status: ensured.status,
      storagePath: ensured.storagePath,
      createdAt: ensured.createdAt,
    },
    url: signedUrlData.signedUrl,
  })
}
