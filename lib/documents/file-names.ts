import { JOB_NUMBER_PREFIX } from "@/lib/job-numbering"

/**
 * Leading word of a generated file name. File names start with a capital
 * letter (`Quote-26-0039.pdf`, `Invoice-244453.pdf`) so they read well in a
 * customer's inbox and downloads folder.
 */
export type DocumentFileKind =
  | "Quote"
  | "Invoice"
  | "Voucher"
  | "Itinerary"
  | "Worksheet"
  | "Preview"
  | "Audit"
  | "Report"

// Both the current `LTT-YY-NNNN` and the legacy `LTT-YYYY-NNNN` booking numbers.
const BOOKING_NUMBER_PATTERN = new RegExp(`^${JOB_NUMBER_PREFIX}-(\\d{2}|\\d{4})-(\\d{4,})$`)

// Names the generators wrote before file names were capitalised
// (`quote-LTT-2026-0038.pdf`), plus the capitalised ones they write now.
const GENERATED_FILE_PATTERN = /^(quote|invoice|voucher|itinerary|worksheet)-(.+)\.pdf$/i

/**
 * Short, prefix-free booking reference used in file names:
 * `LTT-2026-0038` → `26-0038`, `LTT-26-0039` → `26-0039`. Anything that is not
 * a booking number is returned unchanged.
 */
export function shortBookingRef(bookingNumber: string): string {
  const match = BOOKING_NUMBER_PATTERN.exec(bookingNumber.trim())
  if (!match) return bookingNumber
  const [, year, sequence] = match
  return `${year.slice(-2)}-${sequence}`
}

/** Replaces anything unsafe in a storage key or attachment name with `_`. */
export function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

/** `documentFileName("Quote", "26-0039")` → `Quote-26-0039.pdf`. */
export function documentFileName(kind: DocumentFileKind, ref: string, ext = "pdf"): string {
  return `${kind}-${sanitizeFileNamePart(ref)}.${ext}`
}

/** Strips a trailing quote version (`-Q2`) so a quote file is named after its booking. */
export function stripQuoteVersion(quoteNumber: string): string {
  return quoteNumber.replace(/-Q\d+$/, "")
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Download name for a stored generated PDF, derived from its storage path.
 *
 * Files generated before the rename keep their lowercase storage keys
 * (`quotes/LTT-2026-0038-Q1/quote-LTT-2026-0038-Q1.pdf`); this maps them to
 * the current naming (`Quote-26-0038.pdf`) so a download reads the same no
 * matter when the file was generated. Current names pass through unchanged.
 */
export function downloadNameForStoredFile(storagePath: string): string {
  const basename = storagePath.split("/").pop() ?? storagePath
  const match = GENERATED_FILE_PATTERN.exec(basename)
  if (!match) return capitalise(basename)

  const kind = capitalise(match[1].toLowerCase()) as DocumentFileKind
  const rawRef = kind === "Quote" ? stripQuoteVersion(match[2]) : match[2]
  return documentFileName(kind, shortBookingRef(rawRef))
}
