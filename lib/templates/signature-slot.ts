// Marker-comment signature slot inside fully rendered branded emails.
//
// composeEmail brackets the rendered signature fragment with these markers
// so the send dialog can swap in a different brand's rendering (fetched from
// POST /api/email-signature/render) without re-rendering the React Email
// wrapper on the server. Pure string functions — safe to import from both
// server and client code. Mirrors lib/templates/content-slot.ts.

export const SIGNATURE_SLOT_START = "<!--LUXUS_SIGNATURE_START-->"
export const SIGNATURE_SLOT_END = "<!--LUXUS_SIGNATURE_END-->"

/** Extract the signature fragment between the slot markers, or null if absent. */
export function extractSignatureSlot(fullHtml: string): string | null {
  const start = fullHtml.indexOf(SIGNATURE_SLOT_START)
  if (start === -1) return null
  const contentStart = start + SIGNATURE_SLOT_START.length
  const end = fullHtml.indexOf(SIGNATURE_SLOT_END, contentStart)
  if (end === -1) return null
  return fullHtml.slice(contentStart, end)
}

/**
 * Replace the fragment between the slot markers with new HTML.
 * Returns null when the markers are missing so callers can fall back to
 * leaving the email untouched rather than corrupting it — pre-migration
 * stored HTML has no signature markers.
 */
export function replaceSignatureSlot(fullHtml: string, signatureHtml: string): string | null {
  const start = fullHtml.indexOf(SIGNATURE_SLOT_START)
  if (start === -1) return null
  const contentStart = start + SIGNATURE_SLOT_START.length
  const end = fullHtml.indexOf(SIGNATURE_SLOT_END, contentStart)
  if (end === -1) return null
  return fullHtml.slice(0, contentStart) + signatureHtml + fullHtml.slice(end)
}
