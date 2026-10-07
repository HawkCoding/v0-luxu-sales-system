// Renders the per-sender name/contact block (top of the signature) from an
// admin-authored rich-text layout containing {{fullName}}/{{jobTitle}}/etc.
// fill-ins, plus the resolved person fields for one send. Pure string
// functions — no DOM, safe on the server.
//
// A brand's `sender_layout` override (or the shared `signature_sender_layout`
// default) is authored with the same HtmlBodyEditor toolbar as the company
// text fields, so it's already sanitized on write (see signature-html.ts).
// This module is only responsible for filling in the {{token}}s and
// dropping any " | "-separated segment whose only content was an empty
// field — e.g. a person with no fax number never leaves a bare "Fax: |" on
// the line.
//
// It also owns styleSignatureLinks, which every signature block runs its
// HTML through so links read as signature text instead of a client's
// default blue.

/** Text colour of the sender name/contact block (emails/email-signature.tsx) — and of its links. */
export const SIGNATURE_TEXT_COLOR = "#3d3831"

export interface SenderLayoutFields {
  fullName: string
  jobTitle: string | null
  tel: string | null
  cell: string | null
  fax: string | null
  email: string | null
  website: string | null
}

export const SENDER_LAYOUT_TOKENS: { token: keyof SenderLayoutFields; label: string }[] = [
  { token: "fullName", label: "Full name" },
  { token: "jobTitle", label: "Job title" },
  { token: "tel", label: "Tel" },
  { token: "cell", label: "Cell" },
  { token: "fax", label: "Fax" },
  { token: "email", label: "Email" },
  { token: "website", label: "Website" },
]

/** Reproduces the layout emails/email-signature.tsx rendered before this feature existed. */
export const DEFAULT_SENDER_LAYOUT =
  "<strong>{{fullName}}</strong> | <em>{{jobTitle}}</em><br>" +
  "Tel: {{tel}} | Cell: {{cell}} | Fax: {{fax}}<br>" +
  "Email: {{email}} | Web: {{website}}"

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function tokensInPart(part: string): string[] {
  return Array.from(part.matchAll(TOKEN_RE)).map((match) => match[1])
}

function fieldValue(fields: SenderLayoutFields, token: string): string {
  const raw = (fields as unknown as Record<string, string | null | undefined>)[token]
  return raw?.trim() ?? ""
}

/**
 * Drops any " | "-separated segment of `line` whose every referenced token
 * is empty. A segment with no tokens at all (static admin-authored text) is
 * always kept.
 */
function dropEmptyParts(line: string, fields: SenderLayoutFields): string {
  const parts = line.split(" | ")
  const kept = parts.filter((part) => {
    const tokens = tokensInPart(part)
    if (tokens.length === 0) return true
    return tokens.some((token) => fieldValue(fields, token) !== "")
  })
  return kept.join(" | ")
}

/** Replaces every {{token}} with its escaped value; email/website become mailto:/https: links. */
function substituteTokens(text: string, fields: SenderLayoutFields): string {
  return text.replace(TOKEN_RE, (_match, name: string) => {
    const value = fieldValue(fields, name)
    if (!value) return ""
    const escaped = escapeHtml(value)
    if (name === "email") return `<a href="mailto:${escaped}">${escaped}</a>`
    if (name === "website") {
      const stripped = escapeHtml(value.replace(/^https?:\/\//i, ""))
      return `<a href="https://${stripped}">${escaped}</a>`
    }
    return escaped
  })
}

/**
 * Fill `layoutHtml` (or DEFAULT_SENDER_LAYOUT when blank) in with `fields`,
 * dropping empty parts and lines left with nothing. `layoutHtml` must
 * already be sanitized — this module does no HTML sanitizing of its own,
 * only token substitution and escaping of the field values. Accepts
 * null/undefined defensively (a brand with no override resolves to one of
 * these upstream in some callers) rather than throwing. Every link comes
 * back styled in SIGNATURE_TEXT_COLOR (see styleSignatureLinks).
 */
export function renderSenderLayout(layoutHtml: string | null | undefined, fields: SenderLayoutFields): string {
  const source = layoutHtml?.trim() || DEFAULT_SENDER_LAYOUT
  const lines = source
    .split(/<br\s*\/?>/i)
    .map((line) => dropEmptyParts(line, fields))
    .filter((line) => line.trim().length > 0)
    .map((line) => substituteTokens(line, fields))
  return styleSignatureLinks(lines.join("<br>"), SIGNATURE_TEXT_COLOR)
}

const LINK_OR_SPAN_TAG_RE = /<(\/?)(a|span)(\s[^>]*)?>/gi
const STYLE_ATTR_RE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const COLOR_DECLARATION_RE = /(?:^|;)\s*color\s*:\s*([^;]+)/i
const TEXT_DECORATION_DECLARATION_RE = /(?:^|;)\s*text-decoration(?:-line)?\s*:/i
// A span's colour is copied into a link's style attribute, so only plain colour syntax is carried over.
const SAFE_COLOR_RE = /^[#a-z0-9(),.%\s]+$/i

function styleAttrValue(attrs: string): string | null {
  const match = attrs.match(STYLE_ATTR_RE)
  return match ? (match[1] ?? match[2] ?? "") : null
}

function declaredColor(style: string | null): string | null {
  const value = style?.match(COLOR_DECLARATION_RE)?.[1]?.trim()
  return value && SAFE_COLOR_RE.test(value) ? value : null
}

/**
 * Gives every `<a>` in a signature fragment an inline colour and no
 * underline, so a link reads as the signature text around it rather than a
 * mail client's default blue. Inline is the only form that works: Outlook
 * and Gmail ignore `color: inherit` on a link, and Gmail/iOS auto-link a
 * bare address or URL in blue — an explicitly styled anchor covers both.
 *
 * A link inside a coloured `<span>` takes that span's colour (the author's
 * choice); otherwise it takes `color`. A link that already declares a colour
 * or text-decoration keeps it, which also makes this idempotent. Expects
 * sanitized signature HTML (inline tags only, double-quoted attributes).
 */
export function styleSignatureLinks(html: string, color: string): string {
  const spanColors: (string | null)[] = []
  return html.replace(LINK_OR_SPAN_TAG_RE, (tag: string, closing: string, name: string, rawAttrs?: string) => {
    const attrs = rawAttrs ?? ""
    if (name.toLowerCase() === "span") {
      if (closing) spanColors.pop()
      else spanColors.push(declaredColor(styleAttrValue(attrs)))
      return tag
    }
    if (closing) return tag

    const existing = styleAttrValue(attrs)
    const declarations = (existing ?? "").trim().replace(/;\s*$/, "").replace(/"/g, "&quot;")
    const additions: string[] = []
    if (!COLOR_DECLARATION_RE.test(declarations)) {
      const inherited = [...spanColors].reverse().find((value) => value !== null)
      additions.push(`color:${inherited ?? color}`)
    }
    if (!TEXT_DECORATION_DECLARATION_RE.test(declarations)) additions.push("text-decoration:none")
    if (additions.length === 0) return tag

    const style = [...additions, declarations].filter(Boolean).join(";")
    const otherAttrs = existing === null ? attrs : attrs.replace(STYLE_ATTR_RE, "")
    return `<${name}${otherAttrs} style="${style}">`
  })
}
