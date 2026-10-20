// Maps pasted inline font styles onto the editor's allowlist.
//
// Text pasted from Word/Outlook arrives as spans like
// `<span style="font-size: 12pt; font-family: Calibri, sans-serif">`. Tiptap's FontSize and
// FontFamily keep those values as-is, so the paste looked fine, but on the next load the
// serializer (serialize.ts) only lets a span stay editable when its size and family are exact
// allowlisted values. Every pasted paragraph turned into a locked "system generated" block, and
// the font dropdown showed the template default instead of Calibri (client, 2026-10-20).
//
// Sizes snap to the nearest toolbar size and families to the matching stack
// (lib/email/appearance.ts). A family with no match is dropped, so the text falls back to the
// email's font rather than locking the paragraph (a font we don't offer can't be relied on in the
// inbox anyway). A size with no match stays as it is, and the serializer keeps that span locked:
// dropping it would silently change how big the text is. Every other declaration is left for the
// serializer to judge as before.

import { toEmailInlineFontFamilyLoose, toEmailInlineFontSizeLoose } from "@/lib/email/appearance"

/** Each returns the value to keep, or null to drop the declaration. */
const NORMALIZERS: Record<string, (value: string) => string | null> = {
  "font-size": (value) => toEmailInlineFontSizeLoose(value) ?? value,
  "font-family": toEmailInlineFontFamilyLoose,
}

/**
 * `style` with its font-size/font-family values mapped onto the allowlist (an unmatched family
 * removed). Returns the input untouched when nothing changes, and "" when no declaration is left.
 */
export function normalizeFontDeclarations(style: string): string {
  const declarations = style
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
  let changed = false
  const kept: string[] = []
  for (const declaration of declarations) {
    const separator = declaration.indexOf(":")
    const property = separator === -1 ? "" : declaration.slice(0, separator).trim().toLowerCase()
    const normalize = NORMALIZERS[property]
    if (!normalize) {
      kept.push(declaration)
      continue
    }
    const value = declaration.slice(separator + 1).trim()
    const normalized = normalize(value)
    if (normalized !== value) changed = true
    if (normalized) kept.push(`${property}: ${normalized}`)
  }
  if (!changed) return style
  return kept.length > 0 ? `${kept.join("; ")};` : ""
}

/** Normalize the font declarations of every styled <span> in `root` (root included), in place. */
export function normalizeSpanFonts(root: Element): void {
  const spans = root.tagName === "SPAN" ? [root] : []
  spans.push(...Array.from(root.querySelectorAll("span[style]")))
  for (const span of spans) {
    const style = span.getAttribute("style")
    if (style === null) continue
    const normalized = normalizeFontDeclarations(style)
    if (normalized === style) continue
    if (normalized) span.setAttribute("style", normalized)
    else span.removeAttribute("style")
  }
}

/** HTML string form of normalizeSpanFonts, for pasted HTML. Needs a DOM (browser or jsdom). */
export function normalizeSpanFontsHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html")
  normalizeSpanFonts(doc.body)
  return doc.body.innerHTML
}
