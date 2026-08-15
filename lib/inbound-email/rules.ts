export type InboundRuleMatchType = "contains" | "exact" | "regex"

export interface InboundSubjectRule {
  id: string
  name: string
  subjectPattern: string
  matchType: InboundRuleMatchType
  active: boolean
}

function normalizeSubject(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * True when `pattern` is usable for `matchType`. Only `regex` can be unusable -- an uncompilable
 * pattern is caught by `matchesInboundSubjectRule` at sync time and treated as "no match", which
 * means a rule saved with a typo'd regex is permanently inert and never tells the admin who wrote
 * it. Callers that accept a rule from a human must reject it up front with this.
 */
export function isValidSubjectPattern(pattern: string, matchType: InboundRuleMatchType): boolean {
  if (matchType !== "regex") return true
  try {
    new RegExp(pattern.trim(), "i")
    return true
  } catch {
    return false
  }
}

export function matchesInboundSubjectRule(subject: string, rule: InboundSubjectRule): boolean {
  if (!rule.active) return false

  const pattern = rule.subjectPattern.trim()
  if (!pattern) return false

  if (rule.matchType === "regex") {
    try {
      return new RegExp(pattern, "i").test(subject)
    } catch {
      return false
    }
  }

  const normalizedSubject = normalizeSubject(subject)
  const normalizedPattern = normalizeSubject(pattern)

  if (rule.matchType === "exact") {
    return normalizedSubject === normalizedPattern
  }

  return normalizedSubject.includes(normalizedPattern)
}

export function findMatchingInboundSubjectRule(
  subject: string,
  rules: InboundSubjectRule[],
): InboundSubjectRule | null {
  return rules.find((rule) => matchesInboundSubjectRule(subject, rule)) ?? null
}
