/**
 * The kinds a person can file an upload under. The generated kinds (quote, invoice, voucher,
 * summary) are excluded because the stage gates count any row of those kinds as the real document.
 */
export const UPLOADABLE_DOCUMENT_KINDS = ["other", "proof_of_payment"] as const

/** Uploads are the only rows with status `received`; the app's own PDFs are `generated` or `sent`. */
export function isUploadedDocument(document: { status?: string | null }): boolean {
  return document.status === "received"
}
