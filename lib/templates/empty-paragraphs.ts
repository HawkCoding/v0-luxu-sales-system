// Blank lines in email bodies.
//
// The editor writes a blank line as an empty paragraph, `<p></p>` (or `<p style="…"></p>` once a
// spacing control has styled it). In the editor it shows a line's height — ProseMirror puts a
// break inside so the caret has somewhere to sit — but a browser or mail client gives an empty
// <p> no height at all. With the inline `margin: 0` the spacing controls write, every blank line
// the salesperson typed vanished from the preview and the sent email (client, 2026-10-20).
//
// A `<br>` inside gives the paragraph one line of height everywhere, Outlook's Word engine
// included. Pure string function, so it runs on the server (renderTemplate) as well as in the
// editor's serializer.

const EMPTY_PARAGRAPH_RE = /<p(\s[^>]*)?>\s*<\/p>/gi

/** Give every empty `<p>` one line of height: `<p style="x"></p>` -> `<p style="x"><br></p>`. */
export function fillEmptyParagraphs(html: string): string {
  return html.replace(EMPTY_PARAGRAPH_RE, (_match, attributes: string | undefined) => `<p${attributes ?? ""}><br></p>`)
}
