// Shared look of every outgoing email's chrome: the colour tokens used by the
// React Email layout (emails/*) and by the inline-HTML block tokens
// ({{quoteSummaryTable}}, {{bankingDetails}}), plus the Outlook-proof font rule
// for everything outside the editable content slot. Pure constants/strings —
// safe to import from client components (the signature settings preview).

import type { EmailFontFamily } from "@/lib/email/appearance"

// No fill colours: the email is fully plain — no page, container, strip or panel background — so
// it reads like a message typed in Outlook (client, 2026-10-26). Only lines and small print keep a
// colour of their own.
export const EMAIL_COLORS = {
  /** Warm divider: brand strip borders, panel outlines, rules. */
  divider: "#cfc7ba",
  /**
   * Small print (signature legal lines, brand strip subheading). ~6:1 on
   * white, so it clears WCAG AA at 10-11px.
   */
  mutedText: "#6b6258",
} as const

/**
 * Attributes for a layout table inside the content blocks ({{quoteSummaryTable}},
 * {{bankingDetails}}): full width, no spacing of its own, ignored by screen readers.
 */
export const LAYOUT_TABLE_ATTRS =
  'role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;"'

/**
 * An Outlook-proof vertical gap for a layout table: a row exactly `px` tall —
 * the height attribute and CSS, plus a line box of the same size around a
 * non-breaking space, which Outlook's Word engine would otherwise grow to its
 * default line height. Margins on a <div>, <hr> or <table> are what Outlook
 * drops, so the content blocks space themselves with these instead.
 */
export function emailSpacerRow(px: number, extraStyle = ""): string {
  return (
    `<tr><td height="${px}" style="height:${px}px;font-size:${px}px;line-height:${px}px;mso-line-height-rule:exactly;${extraStyle}">` +
    `&nbsp;</td></tr>`
  )
}

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
 * fragment on a plain page, in the email font, inside the same chrome wrapper
 * BaseLayout uses — so the preview matches the sent email.
 */
export function buildSignaturePreviewDocument(fragmentHtml: string, fontFamily: EmailFontFamily): string {
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"/>` +
    `<style>body{padding:0 0 8px;}\n${buildChromeFontCss(fontFamily)}</style>` +
    `</head><body><div class="${CHROME_CLASS_NAME}" style="font-family:${fontFamily}">` +
    fragmentHtml +
    `</div></body></html>`
  )
}
