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

export const EMAIL_APPEARANCE_SETTING_KEYS = ["email_font_family", "email_font_size"] as const

export interface EmailAppearanceSettings {
  email_font_family: EmailFontFamily
  email_font_size: EmailFontSize
}

export const EMAIL_APPEARANCE_DEFAULTS: EmailAppearanceSettings = {
  email_font_family: "Arial, sans-serif",
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

/** Coerce a stored value to an allowlisted size, falling back to the default. */
export function toEmailFontSize(value: string | null | undefined): EmailFontSize {
  const trimmed = value?.trim()
  return (
    EMAIL_FONT_SIZE_OPTIONS.find((option) => option === trimmed)
    ?? EMAIL_APPEARANCE_DEFAULTS.email_font_size
  )
}
