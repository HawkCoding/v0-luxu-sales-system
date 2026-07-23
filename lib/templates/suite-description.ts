// Prose formatter for the accommodation tokens used in email templates.
//
// Turns a suite type plus its chosen configuration options into a line a
// consultant can drop mid-sentence, e.g. "Twin bedded Deluxe Suite with a
// shower". The vocabulary rows (bedroom/bathroom types) are free text per
// supplier, so the grammar lives here rather than in the database.

import type { PricingSnapshot } from "@/lib/types"

/** Variant group labels as written by lib/quotes/build-from-package.ts. */
const BEDROOM_TYPE_LABEL = "Bedroom Type"
const BEDROOM_LAYOUT_LABEL = "Bedroom Layout"
const BATHROOM_TYPE_LABEL = "Bathroom Type"

export interface SuiteSelection {
  suiteTypeName: string
  /** Bedding, e.g. "Twin". */
  bedroomType?: string | null
  bedroomLayout?: string | null
  /** e.g. "Shower". */
  bathroomType?: string | null
}

export interface SuiteTokens {
  /** Suite type name only, e.g. "Deluxe Suite". */
  suiteType: string
  /** Configuration options only, e.g. "Twin bedded, with a shower". */
  suiteConfiguration: string
  /** Full prose line, e.g. "Twin bedded Deluxe Suite with a shower". */
  suiteDescription: string
}

const EMPTY_TOKENS: SuiteTokens = {
  suiteType: "",
  suiteConfiguration: "",
  suiteDescription: "",
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

/** "a", "a and b", "a, b and c". */
function joinNaturally(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)))
}

/** "Twin" -> "Twin bedded" */
function beddingPrefix(selection: SuiteSelection): string {
  const bedding = clean(selection.bedroomType)
  return bedding ? `${bedding} bedded` : ""
}

/** "Shower" -> "with a shower", plus the layout when one is set. */
function configurationSuffix(selection: SuiteSelection): string {
  const bathroom = clean(selection.bathroomType)
  const layout = clean(selection.bedroomLayout)
  const parts: string[] = []

  if (bathroom) parts.push(`with a ${bathroom.toLowerCase()}`)
  if (layout) parts.push(layout)

  return parts.join(", ")
}

function describeSelection(selection: SuiteSelection): string {
  const suite = clean(selection.suiteTypeName)
  if (!suite) return ""

  return [beddingPrefix(selection), suite, configurationSuffix(selection)]
    .filter((part) => part.length > 0)
    .join(" ")
}

function describeConfiguration(selection: SuiteSelection): string {
  return [beddingPrefix(selection), configurationSuffix(selection)]
    .filter((part) => part.length > 0)
    .join(", ")
}

/**
 * Builds the {{suiteType}}, {{suiteConfiguration}} and {{suiteDescription}}
 * token values. Repeated identical suites collapse to a single entry; distinct
 * ones are joined naturally. An empty selection list yields empty strings so a
 * send degrades to a missing line rather than failing.
 */
export function buildSuiteTokens(selections: SuiteSelection[]): SuiteTokens {
  const usable = selections.filter((selection) => clean(selection.suiteTypeName).length > 0)
  if (usable.length === 0) return { ...EMPTY_TOKENS }

  return {
    suiteType: joinNaturally(dedupe(usable.map((selection) => clean(selection.suiteTypeName)))),
    suiteConfiguration: joinNaturally(dedupe(usable.map(describeConfiguration))),
    suiteDescription: joinNaturally(dedupe(usable.map(describeSelection))),
  }
}

/**
 * A variant group only tells us what was *chosen* when it holds exactly one
 * value. The fallback path in build-from-package.ts lists every option the
 * suite type offers, which would otherwise render "Twin, Double bedded …".
 */
function chosenVariant(snapshot: PricingSnapshot, label: string): string | null {
  const group = snapshot.suiteVariants?.find((variant) => variant.label === label)
  if (!group || group.values.length !== 1) return null
  return clean(group.values[0]) || null
}

/** Derives suite selections from quote line-item pricing snapshots. */
export function suiteSelectionsFromSnapshots(
  snapshots: (PricingSnapshot | null | undefined)[],
): SuiteSelection[] {
  const selections: SuiteSelection[] = []

  for (const snapshot of snapshots) {
    if (!snapshot) continue
    const suiteTypeName = clean(snapshot.suiteTypeName)
    if (!suiteTypeName) continue

    selections.push({
      suiteTypeName,
      bedroomType: chosenVariant(snapshot, BEDROOM_TYPE_LABEL),
      bedroomLayout: chosenVariant(snapshot, BEDROOM_LAYOUT_LABEL),
      bathroomType: chosenVariant(snapshot, BATHROOM_TYPE_LABEL),
    })
  }

  return selections
}
