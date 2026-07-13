// Pure HTML <-> editor-HTML translation for the rich-text email body editor.
//
// The email bodies edited in the app are not always simple paragraphs: system
// templates embed block tokens ({{quoteSummaryTable}}, {{bankingDetails}}) that
// either sit as bare text between paragraphs (pre-substitution, Templates page)
// or expand to inline-styled <table>/<div>/<hr> markup (post-substitution, send
// dialogs). A stock rich-text schema silently drops inline styles and unknown
// tags. To avoid that, everything the editor's schema cannot faithfully hold is
// lifted into an opaque "preserved block" placeholder whose raw payload rides in
// a data attribute (URI-encoded so the DOM serializer cannot escape-corrupt it),
// then swapped back byte-for-byte on the way out. The editor never parses the
// exotic markup, so it cannot mangle it.
//
// Zero editor/Tiptap imports — pure string->string via DOMParser (available in
// the browser and the jsdom test environment).

import { PRESERVED_BLOCK_TAG } from "@/lib/templates/rich-text/preserved-block-shared"

// Tags the editor schema represents faithfully. An element is left as-is only
// when it (and all its descendants) are in this set and carry no style/class.
const RICH_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "A",
  "UL",
  "OL",
  "LI",
  "SPAN",
])

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export interface ToEditorResult {
  html: string
  warnings: string[]
}

function humanizeToken(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** True when an element and every descendant are representable rich tags with no style/class. */
function isPlainRich(el: Element): boolean {
  if (!RICH_TAGS.has(el.tagName)) return false
  if (el.hasAttribute("style") || el.hasAttribute("class")) return false
  for (const child of Array.from(el.children)) {
    if (!isPlainRich(child)) return false
  }
  return true
}

function makePlaceholder(doc: Document, attrs: { label: string; token?: string; html?: string }): Element {
  const div = doc.createElement("div")
  div.setAttribute("data-preserved-block", "")
  div.setAttribute("data-label", attrs.label)
  if (attrs.token) div.setAttribute("data-token", attrs.token)
  if (attrs.html !== undefined) div.setAttribute("data-html", encodeURIComponent(attrs.html))
  return div
}

/**
 * Source HTML -> HTML that the editor can parse without loss.
 *
 * @param source      the HTML string as stored/rendered (pre- or post-substitution)
 * @param blockTokens names of block-kind tokens ({{name}}) to treat as opaque blocks
 */
export function toEditorHtml(source: string, blockTokens: string[]): ToEditorResult {
  const warnings: string[] = []
  const blockSet = new Set(blockTokens)
  const doc = new DOMParser().parseFromString(source, "text/html")
  const body = doc.body
  const out: Node[] = []

  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === doc.TEXT_NODE) {
      const text = node.textContent ?? ""
      // Split a bare text node on any block tokens it contains: surrounding
      // text stays text, each block token becomes a placeholder.
      let lastIndex = 0
      let matched = false
      for (const match of text.matchAll(TOKEN_RE)) {
        const name = match[1]
        if (!blockSet.has(name)) continue
        matched = true
        const before = text.slice(lastIndex, match.index)
        if (before.trim()) out.push(doc.createTextNode(before))
        out.push(makePlaceholder(doc, { label: humanizeToken(name), token: name }))
        lastIndex = (match.index ?? 0) + match[0].length
      }
      if (matched) {
        const rest = text.slice(lastIndex)
        if (rest.trim()) out.push(doc.createTextNode(rest))
      } else if (text.trim()) {
        out.push(node.cloneNode(true))
      }
      continue
    }

    if (node.nodeType !== doc.ELEMENT_NODE) continue
    const el = node as Element

    if (isPlainRich(el)) {
      // A block token nested inside inline/rich content would serialize to
      // invalid HTML after substitution (<p><div><table>...</p>). Leave it as
      // literal text but warn so the latent bug is visible.
      for (const match of (el.textContent ?? "").matchAll(TOKEN_RE)) {
        if (blockSet.has(match[1])) {
          warnings.push(
            `{{${match[1]}}} is inside a <${el.tagName.toLowerCase()}>; it will produce invalid HTML when sent. Move it to its own line.`,
          )
        }
      }
      out.push(el.cloneNode(true))
      continue
    }

    // Anything else (table, styled div, hr, unknown tags) -> opaque placeholder.
    out.push(makePlaceholder(doc, { label: humanizeToken(el.tagName.toLowerCase()), html: el.outerHTML }))
  }

  const container = doc.createElement("div")
  for (const node of out) container.appendChild(node)
  return { html: container.innerHTML, warnings }
}

/**
 * Editor getHTML() output -> the original source dialect.
 *
 * Walks top-level children, concatenating either the plain outerHTML or, for a
 * preserved-block placeholder, its exact decoded payload / {{token}} — as a raw
 * string splice so the bytes are exact.
 */
export function fromEditorHtml(editorHtml: string): string {
  const doc = new DOMParser().parseFromString(editorHtml, "text/html")
  const parts: string[] = []

  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === doc.TEXT_NODE) {
      parts.push(node.textContent ?? "")
      continue
    }
    if (node.nodeType !== doc.ELEMENT_NODE) continue
    const el = node as Element

    if (el.matches(PRESERVED_BLOCK_TAG)) {
      const rawHtml = el.getAttribute("data-html")
      const token = el.getAttribute("data-token")
      if (rawHtml) {
        parts.push(decodeURIComponent(rawHtml))
      } else if (token) {
        parts.push(`{{${token}}}`)
      }
      continue
    }

    parts.push(unwrapListItemParagraphs(el))
  }

  let result = parts.join("")
  // Drop a single trailing empty paragraph artefact the editor appends.
  result = result.replace(/<p><\/p>\s*$/, "")
  return result
}

/**
 * Collapse `<li><p>x</p></li>` to `<li>x</li>`. The editor's listItem content is
 * `paragraph block*`, so bullets serialize with an inner <p> that renders extra
 * margin in email clients.
 */
function unwrapListItemParagraphs(el: Element): string {
  if (el.tagName !== "UL" && el.tagName !== "OL") return el.outerHTML
  for (const li of Array.from(el.querySelectorAll("li"))) {
    if (li.children.length === 1 && li.firstElementChild?.tagName === "P") {
      li.innerHTML = li.firstElementChild.innerHTML
    }
  }
  return el.outerHTML
}

/** True when source survives toEditorHtml -> fromEditorHtml unchanged (ignoring the editor pass). */
export function canRoundTrip(source: string, blockTokens: string[]): boolean {
  const { html } = toEditorHtml(source, blockTokens)
  return normalizeForCompare(fromEditorHtml(html)) === normalizeForCompare(source)
}

/**
 * Canonicalize HTML for equivalence comparison by parsing and re-serializing
 * through the DOM, then collapsing inter-tag whitespace. This folds harmless
 * serialization variants (`<br/>` vs `<br>`, ` ` vs `&nbsp;`) together while
 * still surfacing real structural loss — a dropped style attribute or missing
 * tag survives parse/serialize and therefore still fails the comparison.
 */
export function normalizeForCompare(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.innerHTML.replace(/>\s+</g, "><").trim()
}
