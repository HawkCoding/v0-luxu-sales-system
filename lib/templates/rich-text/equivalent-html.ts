// "Did the user actually change this rich-text field?" — answered on the HTML the editor would
// produce, not on raw strings.
//
// The editor normalises whatever it is given: bare text gains a <p>, `color:rgb(68, 80, 90)`
// comes back as `color: rgb(68, 80, 90);`, and so on. Comparing a stored value against the
// editor's output byte-for-byte therefore reads an untouched field as edited — and a Save then
// writes that field, or worse, a blank one. Both sides are pushed through the same parse ->
// serialise pass the editor uses (Tiptap's generateJSON/generateHTML over the editor's own
// schema) before comparing, so only a real change counts.

import { generateHTML, generateJSON, type Extensions } from "@tiptap/react"
import { buildEditorExtensions } from "@/lib/templates/rich-text/editor-extensions"
import { fromEditorHtml, normalizeForCompare, toEditorHtml } from "@/lib/templates/rich-text/serialize"

/** True when the HTML holds no visible text (a cleared field can serialise to `<p></p>`). */
export function isBlankHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim() === ""
}

const CACHE_LIMIT = 200
const canonicalCache = new Map<string, string>()
let extensions: Extensions | null = null

/**
 * The HTML the editor would emit for `html`, in canonical form. Falls back to the raw string where
 * there is no DOM (server render) or the markup can't be parsed, which only ever makes the
 * comparison stricter, never looser.
 */
export function canonicalEditorHtml(html: string): string {
  const cached = canonicalCache.get(html)
  if (cached !== undefined) return cached
  let canonical = html
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      extensions ??= buildEditorExtensions()
      const json = generateJSON(toEditorHtml(html, []).html, extensions)
      canonical = normalizeForCompare(fromEditorHtml(generateHTML(json, extensions)))
    } catch {
      canonical = html
    }
  }
  if (canonicalCache.size >= CACHE_LIMIT) canonicalCache.clear()
  canonicalCache.set(html, canonical)
  return canonical
}

/** True when two rich-text values render the same once the editor has normalised them. */
export function isEquivalentEditorHtml(a: string, b: string): boolean {
  if (a === b) return true
  if (isBlankHtml(a) && isBlankHtml(b)) return true
  return canonicalEditorHtml(a) === canonicalEditorHtml(b)
}
