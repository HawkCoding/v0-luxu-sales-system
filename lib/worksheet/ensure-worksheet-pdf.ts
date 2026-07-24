import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { buildWorksheetView } from "@/lib/worksheet/build-worksheet-view"
import { renderWorksheetPdf } from "@/lib/worksheet/render-worksheet-pdf"
import { loadBrandLogo } from "@/lib/pdf/brand-logo"
import { getDocumentBrandSettings, resolveDocumentBrand } from "@/lib/settings-access"
import { logError } from "@/lib/error-log"

// The worksheet is a "summary_pdf" (documents.kind), an existing but
// previously-unused enum value purpose-built for a per-job internal record.
// It shares the vouchers bucket rather than a dedicated one, so downloads
// flow through the existing signed-URL route with no storage config change.
export const WORKSHEET_BUCKET = "vouchers"

function sanitizePath(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-]/g, "_")
}

export interface EnsuredWorksheetPdf {
  documentId: string
  bookingId: string
  /** documents.storage_path, prefixed with the bucket. */
  storagePath: string
  filename: string
}

/**
 * Render the booking worksheet PDF, store it, and upsert the documents row.
 * Always re-renders so the PDF reflects the booking's current state — there
 * is no cached/skip path, matching the invoice generator's behaviour.
 */
export async function ensureWorksheetPdf(
  supabase: SupabaseClient<Database>,
  bookingId: string,
): Promise<EnsuredWorksheetPdf> {
  const documentBrand = await getDocumentBrandSettings(supabase)
  const { brand } = resolveDocumentBrand(documentBrand)
  const brandLogo = await loadBrandLogo(brand.logoUrl)

  const view = await buildWorksheetView(supabase, { bookingId })

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderWorksheetPdf({ ...view, brand, brandLogo })
  } catch (err) {
    void logError({
      severity: "Critical",
      source: "worksheet-pdf",
      message: "Worksheet PDF could not be rendered",
      details: { bookingId, error: err instanceof Error ? err.message : String(err) },
    })
    throw new Error("Worksheet PDF could not be rendered")
  }

  const safeNumber = sanitizePath(view.bookingNumber)
  const filename = `worksheet-${safeNumber}.pdf`
  const objectPath = `${safeNumber}/${filename}`

  const { error: uploadError } = await supabase.storage
    .from(WORKSHEET_BUCKET)
    .upload(objectPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    throw new Error("Worksheet PDF could not be stored")
  }

  const documentPath = `${WORKSHEET_BUCKET}/${objectPath}`

  const { data: existingDocument } = await supabase
    .from("documents")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("kind", "summary_pdf")
    .eq("storage_path", documentPath)
    .maybeSingle()

  const documentPayload = {
    booking_id: bookingId,
    kind: "summary_pdf" as const,
    status: "generated" as const,
    storage_path: documentPath,
  }

  const documentWrite = existingDocument
    ? await supabase
        .from("documents")
        .update(documentPayload)
        .eq("id", existingDocument.id)
        .select("id")
        .single()
    : await supabase.from("documents").insert(documentPayload).select("id").single()

  if (documentWrite.error || !documentWrite.data) {
    throw new Error("Worksheet document record could not be written")
  }

  return {
    documentId: documentWrite.data.id,
    bookingId,
    storagePath: documentPath,
    filename,
  }
}
