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
