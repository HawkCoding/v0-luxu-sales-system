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

// Voucher/itinerary body font. Each entry is a metric-compatible open clone of the
// matching email font (see lib/email/appearance.ts) — Arial and Helvetica share
// Arimo since it is metric-compatible with both. Keys are the same CSS stack values
// stored in voucher_template.font_family, so the picker and the embedded glyphs never
// disagree about what a selection renders as.
const VOUCHER_FONT_FAMILIES: Record<string, string> = {
  "Arial, sans-serif": "Arimo",
  "Helvetica, Arial, sans-serif": "Arimo",
  "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif": "Carlito",
  "Georgia, serif": "Gelasio",
  "'Times New Roman', Times, serif": "Tinos",
  "Verdana, Geneva, sans-serif": "DejaVu Sans",
}

const VOUCHER_FONT_DEFAULT = "Arimo"

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
      { src: fontPath("Montserrat-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.register({
    family: "Arimo",
    fonts: [
      { src: fontPath("Arimo-Regular.ttf") },
      { src: fontPath("Arimo-Italic.ttf"), fontStyle: "italic" },
      { src: fontPath("Arimo-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.register({
    family: "Carlito",
    fonts: [
      { src: fontPath("Carlito-Regular.ttf") },
      { src: fontPath("Carlito-Italic.ttf"), fontStyle: "italic" },
      { src: fontPath("Carlito-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.register({
    family: "Gelasio",
    fonts: [
      { src: fontPath("Gelasio-Regular.ttf") },
      { src: fontPath("Gelasio-Italic.ttf"), fontStyle: "italic" },
      { src: fontPath("Gelasio-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.register({
    family: "Tinos",
    fonts: [
      { src: fontPath("Tinos-Regular.ttf") },
      { src: fontPath("Tinos-Italic.ttf"), fontStyle: "italic" },
      { src: fontPath("Tinos-Bold.ttf"), fontWeight: 700 },
    ],
  })
  Font.register({
    family: "DejaVu Sans",
    fonts: [
      { src: fontPath("DejaVuSans-Regular.woff") },
      { src: fontPath("DejaVuSans-Italic.woff"), fontStyle: "italic" },
      { src: fontPath("DejaVuSans-Bold.woff"), fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}

/**
 * The voucher and itinerary share one font pairing driven by voucher_template.font_family:
 * display/sans/body all resolve to the same embedded family, so the whole document renders
 * in a single, honest typeface instead of the old fixed Playfair+Montserrat split.
 */
export function resolveDocumentFontPairing(fontFamily: string | null | undefined): DocumentFontPairing {
  const family = VOUCHER_FONT_FAMILIES[fontFamily ?? ""] ?? VOUCHER_FONT_DEFAULT
  return { display: family, sans: family, body: family }
}
