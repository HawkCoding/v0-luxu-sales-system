import { type ParsedDraft, type ValidationResult, validateDraft } from "@/lib/import/parseEmailDraft"

export interface EmailImportReviewMetadata {
  needsReview: boolean
  missingFields: string[]
  warnings: string[]
}

export function getEmailImportReviewMetadata(draft: ParsedDraft): EmailImportReviewMetadata {
  const validation: ValidationResult = validateDraft(draft)
  const lowConfidenceWarnings = Object.values(draft.confidence).includes("low")
    ? validation.warnings
    : []

  return {
    needsReview: !validation.isValid || lowConfidenceWarnings.length > 0,
    missingFields: validation.missingRequired,
    warnings: lowConfidenceWarnings,
  }
}
