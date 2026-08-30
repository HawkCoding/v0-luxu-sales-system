/**
 * Test-only PDF text extraction, backed by the maintained `pdfjs-dist`.
 *
 * Replaces `pdf-parse`, which bundles pdf.js v1.10.100 (2018) and cannot reliably read the
 * PDFs `@react-pdf/renderer` emits: the same invoice buffer failed one CI run with
 * "Illegal character: 41" and the next with "bad XRef entry", while modern pdf.js reads it
 * without complaint. The documents were always valid — only the ancient parser disagreed.
 *
 * Node only: callers must set `// @vitest-environment node`, since the browser build expects a
 * worker to be configured.
 */

async function loadDocument(buffer: Buffer) {
  // The legacy build runs on plain Node with no worker or DOM shims.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  return pdfjs.getDocument({
    // pdf.js takes ownership of the array it is handed, so pass a copy rather than a view
    // onto the caller's buffer — they often assert on those same bytes afterwards.
    data: new Uint8Array(buffer),
    // Keep extraction hermetic: no system font lookups, which differ between a dev machine
    // and a CI container.
    useSystemFonts: false,
  }).promise
}

async function pageItems(document: Awaited<ReturnType<typeof loadDocument>>, pageNumber: number) {
  const page = await document.getPage(pageNumber)
  const content = await page.getTextContent()
  // getTextContent also yields marked-content markers, which carry no text. The ternary narrows
  // to the glyph-bearing items without needing a hand-written type predicate.
  return content.items.flatMap((item) => ("str" in item ? [item] : []))
}

/**
 * Whole-document text, joined the way `pdf-parse`'s default renderer joined it: runs on the
 * same baseline are concatenated with no separator, and a new baseline starts a new line.
 * Preserved deliberately so assertions written against the old extractor keep their meaning.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const document = await loadDocument(buffer)
  let text = ""

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    let lastY: number | undefined
    for (const item of await pageItems(document, pageNumber)) {
      const y = item.transform[5]
      text += lastY === y || lastY === undefined ? item.str : `\n${item.str}`
      lastY = y
    }
  }

  return text
}

/** One string per page, items space-joined — for assertions about which page something lands on. */
export async function extractPdfPageTexts(buffer: Buffer): Promise<string[]> {
  const document = await loadDocument(buffer)
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const items = await pageItems(document, pageNumber)
    pages.push(items.map((item) => item.str).join(" "))
  }

  return pages
}
