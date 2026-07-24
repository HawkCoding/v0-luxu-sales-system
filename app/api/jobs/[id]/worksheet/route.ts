import { requireUser } from "@/lib/api/auth"
import { jsonError, safeSupabaseError } from "@/lib/api/responses"
import { ensureWorksheetPdf, WORKSHEET_BUCKET } from "@/lib/worksheet/ensure-worksheet-pdf"

export const runtime = "nodejs"

interface RouteParams {
  params: Promise<{ id: string }>
}

// Any authenticated staff member can generate the booking worksheet —
// unlike suppliers/pricing, gross profit visibility was decided project-wide
// rather than clearance-gated.
export async function POST(_req: Request, { params }: RouteParams) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { supabase } = auth.value
  const { id } = await params
  if (!id) return jsonError("Job id is required", 400)

  let ensured
  try {
    ensured = await ensureWorksheetPdf(supabase, id)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worksheet could not be generated"
    if (message === "Booking not found") return jsonError(message, 404)
    console.error("worksheet-pdf:ensure", err)
    return jsonError(message, 500)
  }

  const objectPath = ensured.storagePath.startsWith(`${WORKSHEET_BUCKET}/`)
    ? ensured.storagePath.slice(WORKSHEET_BUCKET.length + 1)
    : ensured.storagePath

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(WORKSHEET_BUCKET)
    .createSignedUrl(objectPath, 3600)

  if (signedUrlError) {
    return safeSupabaseError("worksheet-pdf:signed-url", signedUrlError)
  }

  return Response.json({
    document: {
      id: ensured.documentId,
      bookingId: ensured.bookingId,
      kind: "summary_pdf",
      filename: ensured.filename,
    },
    url: signedUrlData.signedUrl,
  })
}
