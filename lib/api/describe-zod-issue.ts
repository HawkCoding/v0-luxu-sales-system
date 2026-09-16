import type { ZodIssue } from "zod"

/** "inclusionLines" -> "Inclusion Lines", "unitPrice" -> "Unit Price" */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase())
}

/** Zod's stock wording for a `.nonnegative()` violation ("Number must be greater than or equal
 *  to 0") reads like an internal assertion, not something a salesperson typed wrong. Everything
 *  else is left as Zod wrote it. */
function friendlyDetail(issue: ZodIssue): string {
  if (issue.code === "too_small" && issue.type === "number" && issue.minimum === 0 && issue.inclusive) {
    return "can't be negative"
  }
  return issue.message
}

export interface DescribeIssueOptions {
  /** Path segment name of the array whose index should be named by `lineLabel` instead of a bare
   *  "#N" (e.g. "lineItems" on a quote/booking save). Defaults to "lineItems". */
  arrayKey?: string
  /** Resolves a human label for that array's index — e.g. "Line 6 (Commission)" — so a
   *  validation failure names the row, not just its position. Returning undefined for an index
   *  falls back to "#N". */
  lineLabel?: (index: number) => string | undefined
}

/**
 * Zod's default message ("Number must be greater than or equal to 0") names no field, so a
 * validation failure on a nested array -- inclusion lines, quote line items, routes -- was
 * unattributable: the caller had no way to tell which of dozens of rows was over the limit.
 * Prefixes the human-readable path, and swaps a numeric index for a caller-supplied label
 * (`lineLabel`) when one is available. Custom messages (`ctx.addIssue`) are already hand-written
 * as a complete, standalone sentence -- left alone so this doesn't dump a raw path in front of a
 * fine message.
 */
export function describeValidationIssue(issue: ZodIssue, options: DescribeIssueOptions = {}): string {
  if (issue.code === "custom") return issue.message

  const arrayKey = options.arrayKey ?? "lineItems"
  const path = issue.path
  const segments: string[] = []

  for (let i = 0; i < path.length; i++) {
    const segment = path[i]
    const next = path[i + 1]
    if (typeof segment === "string" && segment === arrayKey && typeof next === "number" && options.lineLabel) {
      const label = options.lineLabel(next)
      if (label) {
        segments.push(label)
        i += 1
        continue
      }
    }
    segments.push(typeof segment === "number" ? `#${segment + 1}` : humanizeKey(String(segment)))
  }

  const location = segments.join(" ")
  const detail = friendlyDetail(issue)
  return location ? `${location}: ${detail}` : detail
}
