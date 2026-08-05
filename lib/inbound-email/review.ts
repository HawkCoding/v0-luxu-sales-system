import { type ParsedDraft, type ValidationResult, validateDraft } from "@/lib/import/parseEmailDraft"

export interface EmailImportReviewMetadata {
  needsReview: boolean
  missingFields: string[]
  warnings: string[]
}

export function getEmailImportReviewMetadata(draft: ParsedDraft): EmailImportReviewMetadata {
  const validation: ValidationResult = validateDraft(draft)

  // A field parsed with low confidence, or an unresolved suite type, is shown to the consultant
  // as a warning -- but on its own it no longer forces the enquiry into Needs Review. That gate is
  // reserved for a genuinely missing required field (validation.isValid): a date read as "low
  // confidence" because it came from free prose is still a real date; a booking with no adults
  // count is not. Resolution failures the parser can't see yet (unmatched supplier/route) and
  // possible duplicates are folded in later, after DB lookups run, in import-booking.ts.
  return {
    needsReview: !validation.isValid,
    missingFields: validation.missingRequired,
    warnings: validation.warnings,
  }
}
