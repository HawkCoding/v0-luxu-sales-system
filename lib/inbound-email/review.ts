import {
  countRequiredComplete,
  type ParsedDraft,
  type ValidationResult,
  validateDraft,
} from "@/lib/import/parseEmailDraft"

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

/**
 * Fewest of the 9 required fields an automated import will accept before it stops believing the
 * email is an enquiry. Deliberately well below 9 -- a half-filled enquiry is exactly what Needs
 * Review exists for -- but above what a non-enquiry on an enquiry thread can reach: an
 * out-of-office auto-reply managed 4 (a name and a reply-to address), a supplier invoice 3.
 */
export const MIN_REQUIRED_FIELDS_FOR_AUTO_IMPORT = 5

export interface EnquiryPlausibility {
  importable: boolean
  /** Human-readable, recorded on the skipped message so an admin can see what was dropped. */
  reason: string
  completed: number
  total: number
}

/**
 * Whether an automated import should create anything at all from this email.
 *
 * A subject rule is the only content gate the sync had, and a rule as ordinary as
 * `contains: "Rovos Rail"` sweeps in every auto-reply and supplier invoice on the thread -- each of
 * which used to become a customer, a booking and a draft quote. This is the automated equivalent of
 * the paste path's disabled Save & Open button: below the bar, nothing is created and the message
 * is recorded as skipped with its raw text, rather than a booking a consultant has to clean up.
 *
 * Two conditions, both required:
 *   1. at least MIN_REQUIRED_FIELDS_FOR_AUTO_IMPORT of the 9 required fields parsed, and
 *   2. at least one piece of trip detail -- a contactable human alone is not an enquiry.
 */
export function assessEnquiryPlausibility(draft: ParsedDraft): EnquiryPlausibility {
  const { completed, total } = countRequiredComplete(draft)
  const hasTripDetail = Boolean(
    draft.trip.supplier || draft.trip.route || draft.trip.departureDate,
  )

  if (completed < MIN_REQUIRED_FIELDS_FOR_AUTO_IMPORT) {
    return {
      importable: false,
      reason: `Only ${completed} of ${total} required fields parsed (minimum ${MIN_REQUIRED_FIELDS_FOR_AUTO_IMPORT}) -- does not look like an enquiry`,
      completed,
      total,
    }
  }

  if (!hasTripDetail) {
    return {
      importable: false,
      reason: "No supplier, route or departure date parsed -- does not look like an enquiry",
      completed,
      total,
    }
  }

  return { importable: true, reason: "", completed, total }
}
