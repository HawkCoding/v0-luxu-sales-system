import path from "path"
import { Font } from "@react-pdf/renderer"

// Server-only module: font files are read from disk at render time.
// TTFs must be static instances — react-pdf/fontkit does not support variable fonts.
// Shared by every @react-pdf/renderer document (voucher, itinerary, invoice) so none
// of them fall back to the base-14 Helvetica font, whose WinAnsi encoding has no slot
// for → / ↔ and mangles them into stray punctuation.

let registered = false

export interface DocumentFontPairing {
  display: string
  sans: string
  body: string
}

const DISPLAY_FAMILY = "Playfair Display"
const SANS_FAMILY = "Montserrat"

// The template font_family option selects the body leaning;
// display and label faces are always the fixed pairing.
const SANS_BODY_STACKS = new Set(["Arial, sans-serif", "'Montserrat', Arial, sans-serif"])

function fontPath(file: string): string {
  return path.join(process.cwd(), "assets", "fonts", file)
}

export function registerDocumentFonts(): void {
  if (registered) return

  Font.register({
    family: DISPLAY_FAMILY,
    fonts: [
      { src: fontPath("PlayfairDisplay-Regular.ttf") },
      { src: fontPath("PlayfairDisplay-Italic.ttf"), fontStyle: "italic" },
      { src: fontPath("PlayfairDisplay-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.register({
    family: SANS_FAMILY,
    fonts: [
      { src: fontPath("Montserrat-Regular.ttf") },
      { src: fontPath("Montserrat-SemiBold.ttf"), fontWeight: 600 },
      { src: fontPath("Montserrat-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}

export function resolveDocumentFontPairing(fontFamily: string | null | undefined): DocumentFontPairing {
  const body = SANS_BODY_STACKS.has(fontFamily ?? "") ? SANS_FAMILY : DISPLAY_FAMILY
  return { display: DISPLAY_FAMILY, sans: SANS_FAMILY, body }
}
