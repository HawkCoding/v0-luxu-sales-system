import { Font } from "@react-pdf/renderer"
import { VOUCHER_TEMPLATE_DEFAULTS } from "@/lib/types"

let registered = false

const FONT_FAMILY_MAP: Record<string, string> = {
  "Georgia, serif": "Times-Roman",
  "'Playfair Display', Georgia, serif": "Times-Roman",
  "Arial, sans-serif": "Helvetica",
  "'Montserrat', Arial, sans-serif": "Helvetica",
}

export function registerVoucherFonts(): void {
  if (registered) return

  Font.registerHyphenationCallback((word) => [word])
  registered = true
}

export function resolveVoucherFontFamily(fontFamily: string | null | undefined): string {
  return FONT_FAMILY_MAP[fontFamily ?? ""] ?? FONT_FAMILY_MAP[VOUCHER_TEMPLATE_DEFAULTS.font_family] ?? "Helvetica"
}
