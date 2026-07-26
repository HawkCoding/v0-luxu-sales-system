/**
 * The `email_import_missing_fields` entry used when a suite's type could not be identified from
 * the enquiry wording. Shared so the two intake paths write it, the enquiry list can badge it,
 * and the auto-clear recompute can remove it, without three copies of the string drifting apart.
 */
export const SUITE_TYPE_MISSING_FIELD = "Suite type"

/** Recomputes a missing-fields list for a booking whose suites have since been resolved. */
export function withSuiteTypeMissingField(
  missingFields: readonly string[],
  hasUnresolvedSuites: boolean,
): string[] {
  const withoutSuiteType = missingFields.filter((field) => field !== SUITE_TYPE_MISSING_FIELD)
  return hasUnresolvedSuites ? [...withoutSuiteType, SUITE_TYPE_MISSING_FIELD] : withoutSuiteType
}
