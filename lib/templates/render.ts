// Pure token-substitution engine for email templates.
//
// Templates use {{tokenName}} placeholders. Scalar values are HTML-escaped
// in the body (HTML) but inserted raw in the subject (plain text); block
// values (pre-built HTML fragments) are inserted raw and only into the
// body, never the subject. Tokens present in the template but not supplied
// are left visible and reported as warnings so the salesperson catches them
// in the preview instead of the customer catching them in their inbox.

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export interface RenderTemplateInput {
  subject: string
  bodyHtml: string
  /** Scalar values — HTML-escaped on substitution. */
  tokens: Record<string, string>
  /** Raw HTML fragments — inserted unescaped, body only. */
  blocks?: Record<string, string>
}

export interface RenderedTemplate {
  subject: string
  bodyHtml: string
  warnings: string[]
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function substitute(
  text: string,
  tokens: Record<string, string>,
  blocks: Record<string, string>,
  allowBlocks: boolean,
  unknown: Set<string>,
  escape: boolean,
): string {
  return text.replace(TOKEN_RE, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(tokens, name)) {
      return escape ? escapeHtml(tokens[name]) : tokens[name]
    }
    if (allowBlocks && Object.prototype.hasOwnProperty.call(blocks, name)) {
      return blocks[name]
    }
    unknown.add(name)
    return match
  })
}

export function renderTemplate(input: RenderTemplateInput): RenderedTemplate {
  const blocks = input.blocks ?? {}
  const unknown = new Set<string>()

  const subject = substitute(input.subject, input.tokens, blocks, false, unknown, false)
  const bodyHtml = substitute(input.bodyHtml, input.tokens, blocks, true, unknown, true)

  const warnings = [...unknown].sort().map((name) => `Unreplaced token: {{${name}}}`)

  return { subject, bodyHtml, warnings }
}
