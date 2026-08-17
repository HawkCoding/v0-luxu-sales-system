import { EMAIL_FONT_FAMILY_LABELS, EMAIL_FONT_FAMILY_OPTIONS, type EmailFontFamily } from "@/lib/email/appearance"

// The voucher/itinerary PDF renderer embeds a real font file per family (see
// lib/pdf/document-fonts.ts), so it can only offer fonts with a faithful open-licence
// metric clone. Trebuchet MS and Tahoma have none, so the voucher list is a subset of
// the email font list rather than an approximation — reusing EMAIL_FONT_FAMILY_OPTIONS
// keeps the two lists from silently drifting apart.
const UNSUPPORTED_IN_PDF: readonly EmailFontFamily[] = [
  "'Trebuchet MS', sans-serif",
  "Tahoma, Geneva, sans-serif",
]

export const VOUCHER_FONT_OPTIONS = EMAIL_FONT_FAMILY_OPTIONS
  .filter((option) => !UNSUPPORTED_IN_PDF.includes(option))
  .map((value) => ({ value, label: EMAIL_FONT_FAMILY_LABELS[value] }))

export type VoucherFontFamily = (typeof VOUCHER_FONT_OPTIONS)[number]["value"]

export const VOUCHER_FONT_DEFAULT: VoucherFontFamily = "Arial, sans-serif"
