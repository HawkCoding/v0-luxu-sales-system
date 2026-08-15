/**
 * Flattens an HTML email body to the line-oriented plain text the parser expects.
 *
 * `</td>` and `</th>` end a line just like `</tr>` does: an HTML enquiry is laid out as
 * `<tr><td>Country</td><td>South Africa</td></tr>`, and without a break after each cell the whole
 * row collapsed onto one space-separated line. With no `:` or `|` left to split on, the label
 * reader lost the value entirely -- six of nine required fields blanked, "Direction" swallowed into
 * its own answer, and the suite phrase invented as "of suites" from a collapsed "No of Suites" row.
 * One cell per line puts the label and its value on consecutive lines, which is the shape the
 * next-line fallback in parseEmailDraft already handles.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|li|tr|td|th|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function createRawEmailPreview(text: string, maxLength = 5000): string {
  const normalized = text.replace(/\s+\n/g, "\n").trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}
