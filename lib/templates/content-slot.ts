// Marker-comment content slot inside fully rendered branded emails.
//
// composeEmail brackets the editable template content with these markers so
// the client can swap the inner body (edited by the salesperson in the
// preview dialog) back into the full branded HTML without re-rendering the
// React Email wrapper on the server. Pure string functions — safe to import
// from both server and client code.

export const CONTENT_SLOT_START = "<!--LUXUS_CONTENT_START-->"
export const CONTENT_SLOT_END = "<!--LUXUS_CONTENT_END-->"

/** Extract the editable content between the slot markers, or null if absent. */
export function extractContentSlot(fullHtml: string): string | null {
  const start = fullHtml.indexOf(CONTENT_SLOT_START)
  if (start === -1) return null
  const contentStart = start + CONTENT_SLOT_START.length
  const end = fullHtml.indexOf(CONTENT_SLOT_END, contentStart)
  if (end === -1) return null
  return fullHtml.slice(contentStart, end)
}

/**
 * Replace the content between the slot markers with new HTML.
 * Returns null when the markers are missing so callers can fall back to
 * sending the edited content unwrapped rather than corrupting the email.
 */
export function replaceContentSlot(fullHtml: string, contentHtml: string): string | null {
  const start = fullHtml.indexOf(CONTENT_SLOT_START)
  if (start === -1) return null
  const contentStart = start + CONTENT_SLOT_START.length
  const end = fullHtml.indexOf(CONTENT_SLOT_END, contentStart)
  if (end === -1) return null
  return fullHtml.slice(0, contentStart) + contentHtml + fullHtml.slice(end)
}
