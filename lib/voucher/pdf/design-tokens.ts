// Voucher PDF design tokens. Scoped to the voucher document for now;
// extraction candidate if itinerary/quote PDFs adopt the same system.

export interface VoucherTokens {
  accent: string
  eyebrow: string
  frameOuter: string
  frameInner: string
  rule: string
  ruleFaint: string
  ink: string
  inkMuted: string
  inkFaint: string
}

// Solid hex blended over white instead of rgba: react-pdf renders
// alpha border colors unreliably, so tones are precomputed.
export function tintWithWhite(hex: string, strength: number): string {
  const clamped = Math.min(1, Math.max(0, strength))
  let value = hex.trim().replace(/^#/, "")
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("")
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    value = "000000"
  }
  const blend = (channel: number) => Math.round(channel * clamped + 255 * (1 - clamped))
  const toHex = (channel: number) => blend(channel).toString(16).padStart(2, "0")
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function voucherTokens({
  accentColour,
  sectionBg,
}: {
  accentColour: string
  sectionBg: string
}): VoucherTokens {
  return {
    accent: accentColour,
    eyebrow: sectionBg,
    frameOuter: tintWithWhite(accentColour, 0.9),
    frameInner: tintWithWhite(accentColour, 0.35),
    rule: tintWithWhite(accentColour, 0.45),
    ruleFaint: tintWithWhite(sectionBg, 0.3),
    ink: "#2B2B2B",
    inkMuted: "#6B6B6B",
    inkFaint: "#9A9A9A",
  }
}
