// Filters a supplier's tagged inclusion/exclusion rows (supplier_inclusion_lines)
// down to the bullets that apply to one quote's resolved journey class and rate
// audience, and hands back the same BulletLine[] shape the untagged renderer
// (lib/inclusions/bullet-lines.ts) already produces downstream.
//
// Every row carries its own resolved tags -- there is no inheritance from a
// heading to the items beneath it. A null tag on an axis means "any", not
// "same as the heading". The supplier form's section editor
// (lib/inclusions/sections.ts) is what stamps a section's tags onto every row
// it emits, so this filter only ever has to check one row at a time. A
// heading is dropped when it doesn't match the context itself, or when it has
// no surviving item beneath it -- a bare label reads as noise, same rule
// formatBulletLinesInline already applies to the untagged list.

import type { BulletLine } from "@/lib/inclusions/bullet-lines"
import type { JourneyClass, RateAudience } from "@/lib/quotes/quote-config"

export interface SupplierInclusionLine {
  kind: "heading" | "item"
  text: string
  journeyTag: JourneyClass | null
  rateTag: RateAudience | null
}

export interface InclusionFilterContext {
  /** Null when the quote's train has no short/long concept, or it isn't resolved yet
   * -- a journey-tagged line never matches a null journey class. */
  journeyClass: JourneyClass | null
  rateAudience: RateAudience
}

function matchesTags(
  journeyTag: JourneyClass | null,
  rateTag: RateAudience | null,
  ctx: InclusionFilterContext,
): boolean {
  if (journeyTag != null && journeyTag !== ctx.journeyClass) return false
  if (rateTag != null && rateTag !== ctx.rateAudience) return false
  return true
}

export function filterInclusionLines(
  lines: readonly SupplierInclusionLine[],
  ctx: InclusionFilterContext,
): BulletLine[] {
  const result: BulletLine[] = []
  let heading: { text: string; matches: boolean } | null = null
  let headingEmitted = false

  for (const line of lines) {
    if (line.kind === "heading") {
      heading = { text: line.text, matches: matchesTags(line.journeyTag, line.rateTag, ctx) }
      headingEmitted = false
      continue
    }

    if (!matchesTags(line.journeyTag, line.rateTag, ctx)) continue
    if (heading && !heading.matches) continue

    if (heading && !headingEmitted) {
      result.push({ kind: "heading", text: heading.text })
      headingEmitted = true
    }
    result.push({ kind: "item", text: line.text })
  }

  return result
}
