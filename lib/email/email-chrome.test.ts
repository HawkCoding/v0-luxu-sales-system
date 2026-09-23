import { describe, expect, it } from "vitest"
import {
  buildChromeFontCss,
  buildSignaturePreviewDocument,
  CHROME_CLASS_NAME,
  EMAIL_COLORS,
  SIGNATURE_BANNER_MAX_WIDTH,
  signatureBannerSize,
} from "./email-chrome"

const CALIBRI = "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif" as const

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("EMAIL_COLORS", () => {
  it("uses Swirl for the page/strips/panels and Angora for the message", () => {
    expect(EMAIL_COLORS.canvas).toBe("#f4f1ee")
    expect(EMAIL_COLORS.panel).toBe("#f4f1ee")
    expect(EMAIL_COLORS.surface).toBe("#e8e5df")
  })

  it("keeps small print at WCAG AA contrast on both Angora and Swirl", () => {
    expect(contrast(EMAIL_COLORS.mutedText, EMAIL_COLORS.surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(EMAIL_COLORS.mutedText, EMAIL_COLORS.canvas)).toBeGreaterThanOrEqual(4.5)
  })

  it("keeps the divider visibly darker than the Angora container", () => {
    expect(luminance(EMAIL_COLORS.divider)).toBeLessThan(luminance(EMAIL_COLORS.surface))
    expect(contrast(EMAIL_COLORS.divider, EMAIL_COLORS.surface)).toBeGreaterThan(1.25)
  })
})

describe("signatureBannerSize", () => {
  it("caps a large upload at 320px wide with a proportional height", () => {
    expect(signatureBannerSize(1280, 320)).toEqual({ width: SIGNATURE_BANNER_MAX_WIDTH, height: 80 })
    expect(signatureBannerSize(640, 150)).toEqual({ width: 320, height: 75 })
  })

  it("rounds the scaled height", () => {
    expect(signatureBannerSize(1000, 333)).toEqual({ width: 320, height: 107 })
  })

  it("leaves a narrower banner at its own size", () => {
    expect(signatureBannerSize(200, 60)).toEqual({ width: 200, height: 60 })
  })

  it("falls back to the cap width with no height when dimensions are unknown", () => {
    expect(signatureBannerSize(null, null)).toEqual({ width: 320 })
    expect(signatureBannerSize(0, 100)).toEqual({ width: 320 })
    expect(signatureBannerSize(900, null)).toEqual({ width: 320 })
  })
})

describe("buildChromeFontCss", () => {
  it("sets the family on the chrome and its block/inline children, never a size", () => {
    const css = buildChromeFontCss(CALIBRI)
    for (const el of ["p", "td", "a", "span", "div"]) {
      expect(css).toContain(`.${CHROME_CLASS_NAME} ${el}`)
    }
    expect(css).toContain(`font-family: ${CALIBRI};`)
    expect(css).not.toContain("font-size")
    expect(css).not.toContain("line-height")
  })
})

describe("buildSignaturePreviewDocument", () => {
  it("wraps the fragment on Angora in the chrome font", () => {
    const doc = buildSignaturePreviewDocument("<p>Leonie</p>", CALIBRI)
    expect(doc).toContain(`background-color:${EMAIL_COLORS.surface}`)
    expect(doc).toContain(`<div class="${CHROME_CLASS_NAME}" style="font-family:${CALIBRI}"><p>Leonie</p></div>`)
    expect(doc).toContain(buildChromeFontCss(CALIBRI))
  })
})
