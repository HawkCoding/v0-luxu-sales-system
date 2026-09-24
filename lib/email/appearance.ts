// Global font for outgoing emails. No server imports — the settings editor is a
// client component and imports these constants directly.
//
// Web-safe stacks only: email clients cannot reliably load custom fonts.
// The family is interpolated into a <style> block in the email <head>, so it is
// an allowlist rather than free text — an arbitrary string would be a CSS
// injection vector into every email we send.
export const EMAIL_FONT_FAMILY_OPTIONS = [
  "Arial, sans-serif",
  "Helvetica, Arial, sans-serif",
  // Calibri ships with Office/Windows rather than being universally installed,
  // so the stack falls through similar humanist sans faces before Arial.
  "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif",
  "Georgia, serif",
  "'Times New Roman', Times, serif",
  "Verdana, Geneva, sans-serif",
  "'Trebuchet MS', sans-serif",
  "Tahoma, Geneva, sans-serif",
] as const

export const EMAIL_FONT_SIZE_OPTIONS = [
  "12px",
  "13px",
  "14px",
  "15px",
  "16px",
  "17px",
  "18px",
] as const

export type EmailFontFamily = (typeof EMAIL_FONT_FAMILY_OPTIONS)[number]
export type EmailFontSize = (typeof EMAIL_FONT_SIZE_OPTIONS)[number]

// Sizes selectable for a highlighted section of an email body, independent of
// the global default above. Rendered as an inline `<span style="font-size:…">`
// in the stored HTML, so — like the family/size options above — this is an
// allowlist rather than free text: an arbitrary value would be a CSS
// injection vector, and the rich-text serializer (lib/templates/rich-text/
// serialize.ts) only treats a span as safely representable when its size is
// one of these.
export const EMAIL_INLINE_FONT_SIZE_OPTIONS = [
  "10px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
] as const

export type EmailInlineFontSize = (typeof EMAIL_INLINE_FONT_SIZE_OPTIONS)[number]

/** True when `value` is exactly one of the allowlisted inline sizes. */
export function isEmailInlineFontSize(value: string | null | undefined): value is EmailInlineFontSize {
  return EMAIL_INLINE_FONT_SIZE_OPTIONS.includes(value as EmailInlineFontSize)
}

// Text colour swatches for a highlighted section of an email body. Brand-
// derived and chosen for contrast on white. Same allowlist rationale as
// sizes above: rendered as an inline `<span style="color:…">`, so the
// rich-text serializer only treats a span as safely representable when its
// colour is one of these.
export const EMAIL_TEXT_COLOR_OPTIONS = [
  "#1c1c1c",
  "#666666",
  "#44505a",
  "#554c42",
  "#b42318",
  "#067647",
  "#b54708",
  "#1e3a5f",
] as const

export type EmailTextColor = (typeof EMAIL_TEXT_COLOR_OPTIONS)[number]

export const EMAIL_TEXT_COLOR_LABELS: Record<EmailTextColor, string> = {
  "#1c1c1c": "Near-black",
  "#666666": "Grey",
  "#44505a": "Slate",
  "#554c42": "Brown",
  "#b42318": "Red",
  "#067647": "Green",
  "#b54708": "Orange",
  "#1e3a5f": "Navy",
}

/**
 * `#rrggbb` -> `rgb(r, g, b)`, matching the exact format browsers (and
 * jsdom) canonicalize a `style` attribute's color value to once it round-
 * trips through the DOM — which any contenteditable mark application does.
 * So content saved via the toolbar comes back as `rgb(...)`, not hex, on
 * the next load; the allowlist below has to recognize both.
 */
function hexToRgbString(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const RGB_COLOR_RE = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i

/** True for a strict `#rrggbb` string — the only shape safe to interpolate into a style attribute. */
export function isHexColor(value: string | null | undefined): value is string {
  return !!value && HEX_COLOR_RE.test(value.trim())
}

/** `rgb(r, g, b)` -> `#rrggbb`, or null if not that exact shape (the DOM's own canonical form for a style color). */
function rgbStringToHex(value: string): string | null {
  const match = value.trim().match(RGB_COLOR_RE)
  if (!match) return null
  const [, r, g, b] = match
  return `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`
}

function buildColorNormalizer<T extends string>(options: readonly T[]): (value: string | null | undefined) => T | null {
  const byValue = new Map<string, T>()
  for (const hex of options) {
    byValue.set(hex, hex)
    byValue.set(hexToRgbString(hex), hex)
  }
  return (value) => (value ? (byValue.get(value.trim()) ?? null) : null)
}

const normalizeTextColor = buildColorNormalizer(EMAIL_TEXT_COLOR_OPTIONS)

/**
 * Canonical `#rrggbb` for `value` (accepting hex or its rgb() form): a preset
 * swatch's canonical hex when it matches one, otherwise the raw hex for any
 * other valid colour (a custom hex, or a custom colour's rgb() round-trip),
 * or null if unrecognisable.
 */
export function toEmailTextColor(value: string | null | undefined): string | null {
  const preset = normalizeTextColor(value)
  if (preset) return preset
  if (!value) return null
  const trimmed = value.trim()
  if (isHexColor(trimmed)) return trimmed.toLowerCase()
  return rgbStringToHex(trimmed)
}

/** True when `value` is (in either hex or rgb() form) a usable text colour — preset or custom. */
export function isEmailTextColor(value: string | null | undefined): boolean {
  return toEmailTextColor(value) !== null
}

// Highlight (background-color) swatches — soft pastels so dark body text
// stays readable on all of them. Same allowlist rationale as above.
export const EMAIL_HIGHLIGHT_COLOR_OPTIONS = [
  "#fff3a3",
  "#dcfce7",
  "#dbeafe",
  "#fce7f3",
  "#ffedd5",
  "#f4efe6",
  "#eeeeee",
] as const

export type EmailHighlightColor = (typeof EMAIL_HIGHLIGHT_COLOR_OPTIONS)[number]

export const EMAIL_HIGHLIGHT_COLOR_LABELS: Record<EmailHighlightColor, string> = {
  "#fff3a3": "Yellow",
  "#dcfce7": "Green",
  "#dbeafe": "Blue",
  "#fce7f3": "Pink",
  "#ffedd5": "Orange",
  "#f4efe6": "Beige",
  "#eeeeee": "Grey",
}

const normalizeHighlightColor = buildColorNormalizer(EMAIL_HIGHLIGHT_COLOR_OPTIONS)

/**
 * Canonical `#rrggbb` for `value` (accepting hex or its rgb() form): a preset
 * swatch's canonical hex when it matches one, otherwise the raw hex for any
 * other valid colour, or null if unrecognisable.
 */
export function toEmailHighlightColor(value: string | null | undefined): string | null {
  const preset = normalizeHighlightColor(value)
  if (preset) return preset
  if (!value) return null
  const trimmed = value.trim()
  if (isHexColor(trimmed)) return trimmed.toLowerCase()
  return rgbStringToHex(trimmed)
}

/** True when `value` is (in either hex or rgb() form) a usable highlight colour — preset or custom. */
export function isEmailHighlightColor(value: string | null | undefined): boolean {
  return toEmailHighlightColor(value) !== null
}

export const EMAIL_APPEARANCE_SETTING_KEYS = ["email_font_family", "email_font_size"] as const

export interface EmailAppearanceSettings {
  email_font_family: EmailFontFamily
  email_font_size: EmailFontSize
}

// Calibri matches the house style of the team's own Outlook mail, so a fresh
// install (or an unrecognised stored value) renders like the rest of the thread.
export const EMAIL_APPEARANCE_DEFAULTS: EmailAppearanceSettings = {
  email_font_family: "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif",
  email_font_size: "16px",
}

export const EMAIL_FONT_FAMILY_LABELS: Record<EmailFontFamily, string> = {
  "Arial, sans-serif": "Arial",
  "Helvetica, Arial, sans-serif": "Helvetica",
  "Calibri, Candara, Segoe, 'Segoe UI', Optima, Arial, sans-serif": "Calibri",
  "Georgia, serif": "Georgia",
  "'Times New Roman', Times, serif": "Times New Roman",
  "Verdana, Geneva, sans-serif": "Verdana",
  "'Trebuchet MS', sans-serif": "Trebuchet MS",
  "Tahoma, Geneva, sans-serif": "Tahoma",
}

/** Coerce a stored value to an allowlisted family, falling back to the default. */
export function toEmailFontFamily(value: string | null | undefined): EmailFontFamily {
  const trimmed = value?.trim()
  return (
    EMAIL_FONT_FAMILY_OPTIONS.find((option) => option === trimmed)
    ?? EMAIL_APPEARANCE_DEFAULTS.email_font_family
  )
}

// Set of family stacks for O(1) lookup, plus the same lookup with every `'`
// rewritten to `"` — the browser (and jsdom) canonicalizes a style
// attribute's font-family quoting to double quotes once it round-trips
// through contenteditable, so a value saved via the toolbar comes back
// double-quoted on the next load even though EMAIL_FONT_FAMILY_OPTIONS is
// authored with single quotes.
const EMAIL_FONT_FAMILY_SET = new Set<string>(EMAIL_FONT_FAMILY_OPTIONS)
const EMAIL_FONT_FAMILY_DOUBLE_QUOTED = new Map<string, EmailFontFamily>(
  EMAIL_FONT_FAMILY_OPTIONS.map((option) => [option.replace(/'/g, '"'), option]),
)

/** True when `value` is exactly one of the allowlisted font-family stacks (either quote style). */
export function isEmailInlineFontFamily(value: string | null | undefined): value is EmailFontFamily {
  if (!value) return false
  return EMAIL_FONT_FAMILY_SET.has(value) || EMAIL_FONT_FAMILY_DOUBLE_QUOTED.has(value)
}

/** Canonical (single-quoted) allowlisted family for `value`, or null if unrecognised. */
export function toEmailInlineFontFamily(value: string | null | undefined): EmailFontFamily | null {
  if (!value) return null
  if (EMAIL_FONT_FAMILY_SET.has(value)) return value as EmailFontFamily
  return EMAIL_FONT_FAMILY_DOUBLE_QUOTED.get(value) ?? null
}

/** Coerce a stored value to an allowlisted size, falling back to the default. */
export function toEmailFontSize(value: string | null | undefined): EmailFontSize {
  const trimmed = value?.trim()
  return (
    EMAIL_FONT_SIZE_OPTIONS.find((option) => option === trimmed)
    ?? EMAIL_APPEARANCE_DEFAULTS.email_font_size
  )
}
