// Outlook-proof spacing for the editable content of a sent email.
//
// The email <head> spaces the template content with class rules (`.luxus-content p { margin: 0 0
// 8px }`, emails/base-layout.tsx). Outlook desktop's Word engine can't be trusted with them — a
// rule like `p:last-child` can't be applied per element at all — and it gives a blank line written
// as `<p><br></p>` no height. So the space the salesperson left after a paragraph, or before the
// signature, showed in every client except Outlook (client, 2026-10-26).
//
// Just before an email goes out (sendEmail, lib/email/transport.ts) — and in the send dialogs'
// previews, so they match — the head rule's spacing is written inline on every paragraph and list
// in the content slot, and every blank line becomes a paragraph holding a non-breaking space,
// which Outlook keeps at a full line's height. An element that already sets its own margin (the
// editor's paragraph spacing control, the generated quote and banking blocks) keeps it.
//
// Never store this output or load it into the editor: 8px is not one of the editor's spacing
// values (lib/email/appearance.ts), so every paragraph would come back as a locked block
// (lib/templates/rich-text/serialize.ts). Pure string functions — safe on server and client,
// like lib/templates/empty-paragraphs.ts.

import { extractContentSlot, replaceContentSlot } from "@/lib/templates/content-slot"

/** The head rule's paragraph spacing, inline. Keep in step with emails/base-layout.tsx. */
export const INLINE_PARAGRAPH_SPACING = "margin:0 0 8px;"

/**
 * The head rule's list spacing, inline. The indent is a left margin with no padding: Outlook
 * ignores padding on a list, and a list at margin-left 0 hangs its bullets off the message's left
 * edge — which is the edge of the email now that nothing pads it.
 */
export const INLINE_LIST_SPACING = "margin:0 0 8px 20px;padding:0;"

// A paragraph with nothing visible in it: empty, whitespace, or a single <br> / non-breaking space.
// (`\s` covers a literal U+00A0 too.)
const BLANK_PARAGRAPH_RE = /<p(\s[^>]*)?>\s*(?:<br\s*\/?>|&nbsp;|&#160;|&#xa0;)?\s*<\/p>/gi
// `<p` followed by whitespace or `>` — never <pre>, <param> or <picture>.
const PARAGRAPH_OPEN_RE = /<p(\s[^>]*)?>/gi
const LIST_OPEN_RE = /<(ul|ol)(\s[^>]*)?>/gi
const STYLE_ATTR_RE = /(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/i

function styleOf(attributes: string): string {
  const match = attributes.match(STYLE_ATTR_RE)
  return match?.[2] ?? match?.[3] ?? ""
}

/** True when `style` sets `property` or one of its longhands (`margin`, `margin-top`, …). */
function declares(style: string, property: "margin" | "padding"): boolean {
  return new RegExp(`(?:^|;)\\s*${property}(?:-[a-z]+)*\\s*:`, "i").test(style)
}

/** `attributes` with `declarations` put in front of its style (a new style attribute if it has none). */
function withLeadingStyle(attributes: string, declarations: string): string {
  if (!STYLE_ATTR_RE.test(attributes)) return `${attributes} style="${declarations}"`
  return attributes.replace(STYLE_ATTR_RE, (_match, prefix: string, doubleQuoted?: string, singleQuoted?: string) =>
    doubleQuoted !== undefined
      ? `${prefix}"${declarations}${doubleQuoted}"`
      : `${prefix}'${declarations}${singleQuoted ?? ""}'`,
  )
}

/**
 * Inline the content spacing on an HTML fragment (the content slot's inner HTML). Idempotent: a
 * second pass finds every margin already set and every blank line already a `&nbsp;` paragraph.
 */
export function inlineContentSpacing(html: string): string {
  return html
    .replace(BLANK_PARAGRAPH_RE, (_match, attributes: string | undefined) => `<p${attributes ?? ""}>&nbsp;</p>`)
    .replace(PARAGRAPH_OPEN_RE, (match, attributes: string | undefined) => {
      const attrs = attributes ?? ""
      if (declares(styleOf(attrs), "margin")) return match
      return `<p${withLeadingStyle(attrs, INLINE_PARAGRAPH_SPACING)}>`
    })
    .replace(LIST_OPEN_RE, (match, tag: string, attributes: string | undefined) => {
      const attrs = attributes ?? ""
      const style = styleOf(attrs)
      // A list that sets either box property has its own indent: leave it whole.
      if (declares(style, "margin") || declares(style, "padding")) return match
      return `<${tag}${withLeadingStyle(attrs, INLINE_LIST_SPACING)}>`
    })
}

/**
 * Inline the content spacing on a full branded email, inside its content slot only — the brand
 * strips and the signature carry their own inline spacing. HTML without slot markers (a plain-text
 * notice, pre-slot stored HTML) comes back unchanged.
 */
export function finalizeContentSlot(fullHtml: string): string {
  const content = extractContentSlot(fullHtml)
  if (content === null) return fullHtml
  return replaceContentSlot(fullHtml, inlineContentSpacing(content)) ?? fullHtml
}
