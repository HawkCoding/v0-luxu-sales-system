// Server-safe sanitizing for the rich-text fields on a signature brand
// (company line, registration line, trading hours, divisions line,
// confidentiality notice, office address, and the sender name/contact
// layout). These are edited with the same HtmlBodyEditor toolbar as email
// bodies (Settings → Email Signatures) and, unlike a template body, are
// never passed through the compose pipeline's block-token substitution — so
// they're sanitized directly with `sanitize-html` rather than routed through
// the editor's own DOMParser-based serializer, which only runs in the
// browser/jsdom.
//
// Kept deliberately narrower than the email body schema: no lists or block
// tokens here, just inline formatting appropriate for a short signature
// line — bold/italic/underline/strike, a link, and a styled span for
// font-size/color/background-color/font-family (validated against the same
// allowlists the rich-text editor enforces client-side).

import sanitizeHtml from "sanitize-html"
import {
  isEmailInlineFontSize,
  isEmailTextColor,
  isEmailHighlightColor,
  isEmailInlineFontFamily,
} from "@/lib/email/appearance"

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "span"]

const STYLE_VALIDATORS: Record<string, (value: string) => boolean> = {
  "font-size": isEmailInlineFontSize,
  color: isEmailTextColor,
  "background-color": isEmailHighlightColor,
  "font-family": isEmailInlineFontFamily,
}

/**
 * Filters a `style` attribute string down to only the allowlisted
 * declarations with allowlisted values, in original order, deduped by
 * property (last one wins) — mirrors the shape
 * lib/templates/rich-text/serialize.ts requires client-side, so a value
 * that survives here also round-trips in the rich-text editor.
 */
function sanitizeStyleAttr(style: string): string | null {
  const kept = new Map<string, string>()
  for (const declaration of style.split(";")) {
    const match = declaration.match(/^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i)
    if (!match) continue
    const property = match[1].toLowerCase()
    const value = match[2].trim()
    const validate = STYLE_VALIDATORS[property]
    if (validate && validate(value)) kept.set(property, value)
  }
  if (kept.size === 0) return null
  return Array.from(kept.entries())
    .map(([property, value]) => `${property}:${value}`)
    .join(";")
}

/**
 * Sanitize a signature rich-text field: strips scripts, event handlers, and
 * any tag/attribute outside the small inline allowlist above, and validates
 * every `style` declaration against the same allowlists the toolbar itself
 * enforces. Safe to call on legacy plain text (no tags survive unescaped,
 * so a bare "Registered in South Africa..." string passes through
 * unchanged) and safe to call twice (idempotent).
 */
export function sanitizeSignatureHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href"],
      span: ["style"],
    },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    transformTags: {
      span: (tagName, attribs) => {
        const style = attribs.style ? sanitizeStyleAttr(attribs.style) : null
        const nextAttribs: Record<string, string> = style ? { style } : {}
        return { tagName, attribs: nextAttribs }
      },
    },
    // "excludeTag" unwraps the tag (drops the <span>...</span> markers, keeps
    // its inner content) — returning a plain `true` here would delete the
    // content too, per sanitize-html's exclusiveFilter contract.
    exclusiveFilter: (frame) => (frame.tag === "span" && !frame.attribs.style ? "excludeTag" : false),
  }).trim()
}

/**
 * Flattens sanitized signature HTML into a single inline run for embedding
 * inside an existing `<Text>`/`<p>` (the react-email components used in
 * emails/email-signature.tsx already render a `<p>`, so a nested `<p>` from
 * the editor's own paragraph wrapping would be invalid HTML and doubles up
 * margins in email clients). Each paragraph boundary becomes a `<br>` and
 * the outer paragraph tags are dropped — call this only on output that has
 * already been through sanitizeSignatureHtml.
 */
export function toInlineSignatureHtml(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/gi, "<br>")
    .replace(/^<p>/i, "")
    .replace(/<\/p>$/i, "")
    .trim()
}

/** True when sanitized signature HTML has no visible text — an all-blank/whitespace field means "inherit the default". */
export function isBlankSignatureHtml(html: string | null | undefined): boolean {
  if (!html) return true
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim()
  return text.length === 0
}
