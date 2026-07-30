// Prose formatter for the accommodation tokens used in email templates.
//
// Turns a suite type plus its chosen configuration options into a line a
// consultant can drop mid-sentence, e.g. "Twin bedded Deluxe Suite with a
// shower". The vocabulary rows (bedroom/bathroom types) are free text per
// supplier, so the grammar lives here rather than in the database.

import type { PricingSnapshot, SupplierKind } from "@/lib/types"

/** Variant group labels as written by lib/quotes/build-from-package.ts. */
const BEDROOM_TYPE_LABEL = "Bedroom Type"
const BEDROOM_LAYOUT_LABEL = "Bedroom Layout"
const BATHROOM_TYPE_LABEL = "Bathroom Type"

/**
 * Which leg names the accommodation line, best first. Trains win: nearly every
 * quote is rail, and a job's flight/transfer/hotel legs each carry their own
 * "suite type" (a cabin class, a vehicle category) which would otherwise be
 * listed alongside the bedroom as if it were one — "Economy, Deluxe and
 * Standard - Mazda". Only the highest-ranked kind actually present is kept, so
 * a hotel-only or transfer-only job still renders something.
 */
const KIND_PRIORITY: SupplierKind[] = [
  "train_operator",
  "hotel_property",
  "airline",
  "tour_operator",
  "vehicle_rental",
  "transfers",
]

/**
 * Prose noun appended when the supplier's type name doesn't carry one, so
 * "Deluxe" reads as "Deluxe Suite". Deliberately not SUPPLIER_VOCABULARY's
 * `suiteType`, whose values ("Suite Type", "Room Type") are admin form labels
 * rather than words that sit in a sentence.
 */
const SUITE_NOUN: Record<SupplierKind, string> = {
  train_operator: "Suite",
  hotel_property: "Room",
  airline: "Cabin",
  tour_operator: "Tour",
  vehicle_rental: "Vehicle",
  transfers: "Vehicle",
}

export interface SuiteSelection {
  suiteTypeName: string
  /** Bedding, e.g. "Twin". */
  bedroomType?: string | null
  bedroomLayout?: string | null
  /** e.g. "Shower". */
  bathroomType?: string | null
  /** Drives both the accommodation-leg ranking and the prose noun. */
  supplierKind?: SupplierKind | null
}

export interface SuiteTokens {
  /** Suite type name only, e.g. "Deluxe Suite". */
  suiteType: string
  /** Configuration options only, e.g. "Twin bedded, with a shower". */
  suiteConfiguration: string
  /**
   * Full prose line, article included, e.g. "a Twin bedded Deluxe Suite with a
   * shower". The article lives here rather than in the template because with
   * more than one suite each entry needs its own — a template can only prefix
   * the whole list.
   */
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

/** "Deluxe" -> "Deluxe Suite"; an already-nouned "Deluxe Suite" is left alone. */
function suiteTypeWithNoun(selection: SuiteSelection): string {
  const name = clean(selection.suiteTypeName)
  const noun = selection.supplierKind ? SUITE_NOUN[selection.supplierKind] : null
  if (!name || !noun) return name
  // Nouns come from the fixed map above, so interpolating them is safe.
  return new RegExp(`\\b${noun}s?\\b`, "i").test(name) ? name : `${name} ${noun}`
}

/** "Twin bedded Deluxe Suite …" -> "a Twin bedded Deluxe Suite …". */
function withArticle(phrase: string): string {
  if (!phrase) return phrase
  return `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`
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
  const suite = suiteTypeWithNoun(selection)
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
 * Narrows a booking's selections to the one leg kind that should name the
 * accommodation line, per KIND_PRIORITY. Selections with no `supplierKind` —
 * quotes priced before the field was carried through — rank below every known
 * kind, and are returned untouched when nothing else is present so those older
 * quotes keep rendering exactly as they did.
 */
export function pickAccommodationSelections(selections: SuiteSelection[]): SuiteSelection[] {
  for (const kind of KIND_PRIORITY) {
    const matches = selections.filter((selection) => selection.supplierKind === kind)
    if (matches.length > 0) return matches
  }
  return selections
}

/**
 * Builds the {{suiteType}}, {{suiteConfiguration}} and {{suiteDescription}}
 * token values from the accommodation leg only. Repeated identical suites
 * collapse to a single entry; distinct ones are joined naturally. An empty
 * selection list yields empty strings so a send degrades to a missing line
 * rather than failing.
 */
export function buildSuiteTokens(selections: SuiteSelection[]): SuiteTokens {
  const named = selections.filter((selection) => clean(selection.suiteTypeName).length > 0)
  const usable = pickAccommodationSelections(named)
  if (usable.length === 0) return { ...EMPTY_TOKENS }

  return {
    suiteType: joinNaturally(dedupe(usable.map(suiteTypeWithNoun))),
    suiteConfiguration: joinNaturally(dedupe(usable.map(describeConfiguration))),
    // Deduped first so identical suites share one article, not one each.
    suiteDescription: joinNaturally(dedupe(usable.map(describeSelection)).map(withArticle)),
  }
}

/**
 * selectedVariants holds exactly what was chosen for the unit, so it's read first.
 * Older quotes built before that field existed only have suiteVariants — the suite
 * type's full list of offered options — where a group only tells us what was
 * *chosen* when it happens to hold exactly one value; anything else would render
 * "Twin, Double bedded …" and is treated as unknown instead.
 */
function chosenVariant(snapshot: PricingSnapshot, label: string): string | null {
  const selected = snapshot.selectedVariants?.find((variant) => variant.label === label)
  if (selected) return clean(selected.values[0]) || null

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
      supplierKind: snapshot.supplierKind,
    })
  }

  return selections
}
