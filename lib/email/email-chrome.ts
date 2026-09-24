// Shared look of every outgoing email's chrome: the colour tokens used by the
// React Email layout (emails/*) and by the inline-HTML block tokens
// ({{quoteSummaryTable}}, {{bankingDetails}}), plus the Outlook-proof font rule
// for everything outside the editable content slot. Pure constants/strings —
// safe to import from client components (the signature settings preview).

import type { EmailFontFamily } from "@/lib/email/appearance"

export const EMAIL_COLORS = {
  /** Swirl — outer page background behind the message. */
  canvas: "#f4f1ee",
  /** Angora — the 640px message container. */
  surface: "#e8e5df",
  /** Swirl — header/footer brand strips and inner panels (quote details, banking details). */
  panel: "#f4f1ee",
  /** Warm divider that still reads on Angora: strip borders, panel borders, rules. */
  divider: "#cfc7ba",
  /**
   * Small print (signature legal lines, brand strip subheading). Darkened from
   * the old #8a7f74, which fell to ~3.1:1 on Angora; this is ~4.8:1 on Angora
   * and ~5.4:1 on Swirl, so it clears WCAG AA at 10-11px.
   */
  mutedText: "#6b6258",
} as const

/** Signature banner display width: half the 640px email, the same in Outlook, Gmail and on a phone. */
export const SIGNATURE_BANNER_MAX_WIDTH = 320

export interface SignatureBannerSize {
  width: number
  /** Omitted when the upload's dimensions are unknown — the client then scales height from the width. */
  height?: number
}

/**
 * The banner's width/height *attributes*. Outlook's Word engine ignores
 * max-width and sizes images purely from these, so they must already be the
 * display size, not the uploaded pixel size (a 1280px upload used to render
 * at 1280px in Outlook). Scales proportionally; never upscales a banner
 * narrower than the cap. Unknown dimensions fall back to the cap width.
 */
export function signatureBannerSize(width: number | null, height: number | null): SignatureBannerSize {
  if (!width || width <= 0) return { width: SIGNATURE_BANNER_MAX_WIDTH }
  const displayWidth = Math.min(SIGNATURE_BANNER_MAX_WIDTH, width)
  if (!height || height <= 0) return { width: displayWidth }
  return { width: displayWidth, height: Math.max(1, Math.round((height * displayWidth) / width)) }
}

/**
 * Class on the signature slot wrapper and the brand strips. The head rule from
 * buildChromeFontCss targets it so Outlook's Word engine — which resets the
 * font on every block element — still renders the chrome in the email font.
 */
export const CHROME_CLASS_NAME = "luxus-chrome"

/**
 * Family-only rule for the chrome. Deliberately no font-size or line-height:
 * the signature and brand strips carry their own sizes inline. `fontFamily`
 * must come from the allowlist in lib/email/appearance.ts — it is
 * interpolated into a <style> block.
 */
export function buildChromeFontCss(fontFamily: EmailFontFamily): string {
  const c = CHROME_CLASS_NAME
  return `
.${c}, .${c} p, .${c} td, .${c} a, .${c} span, .${c} div {
  font-family: ${fontFamily};
}`.trim()
}

/**
 * Standalone document for the Settings signature preview iframe: the rendered
 * fragment on the Angora container colour, in the email font, inside the same
 * chrome wrapper BaseLayout uses — so the preview matches the sent email.
 */
export function buildSignaturePreviewDocument(fragmentHtml: string, fontFamily: EmailFontFamily): string {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>` +
    `<style>body{margin:0;padding:4px 0 16px;background-color:${EMAIL_COLORS.surface};}\n${buildChromeFontCss(fontFamily)}</style>` +
    `</head><body><div class="${CHROME_CLASS_NAME}" style="font-family:${fontFamily}">` +
    fragmentHtml +
    `</div></body></html>`
  )
}
