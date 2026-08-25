// Groups a supplier's flat inclusion/exclusion rows (supplier_inclusion_lines) into the sections the
// supplier form edits, and flattens them back. A section is one optional heading plus a block of
// items that all share the same journey/rate tags -- typing a nine-line list is one textarea and one
// pair of selects rather than nine cards.
//
// Every row carries its own resolved tags (lib/inclusions/filter-lines.ts does not inherit), so
// flattening stamps the section's tags onto each row it emits and grouping can rely on a tag change
// being a real section boundary.

import { splitBulletLines } from "@/lib/inclusions/bullet-lines"
import type { EditableInclusionLine } from "@/lib/inclusions/editable-line"

export type InclusionList = "inclusions" | "exclusions"
export type JourneyTag = "short" | "long"
export type RateTag = "international" | "resident"

export interface InclusionSectionItem {
  /** The persisted row id, or a fresh uuid for an unsaved item. Stable across keystrokes so the
   * textarea holding this section keeps its React identity. */
  id: string
  text: string
}

export interface InclusionSection {
  id: string
  /** Null or blank when the section is a bare block of items continuing under an earlier heading. */
  heading: string | null
  journeyTag: JourneyTag | null
  rateTag: RateTag | null
  items: InclusionSectionItem[]
}

function newId(): string {
  return crypto.randomUUID()
}

export function createEmptySection(): InclusionSection {
  return { id: newId(), heading: "", journeyTag: null, rateTag: null, items: [] }
}

/** The section's items as the one-per-line value its textarea shows. */
export function sectionItemsToText(section: InclusionSection): string {
  return section.items.map((item) => item.text).join("\n")
}

/**
 * Applies an edited textarea value back onto a section. Item ids are matched to the previous items
 * by position so an unchanged line keeps its row id -- only genuinely new lines get a fresh one.
 * Blank lines and pasted `-`/`•`/`*` bullet prefixes are dropped by `splitBulletLines`.
 */
export function sectionItemsFromText(
  previous: readonly InclusionSectionItem[],
  value: string,
): InclusionSectionItem[] {
  return splitBulletLines(value).map((text, index) => ({
    id: previous[index]?.id ?? newId(),
    text,
  }))
}

function sameTags(
  a: { journeyTag: JourneyTag | null; rateTag: RateTag | null },
  b: { journeyTag: JourneyTag | null; rateTag: RateTag | null },
): boolean {
  return a.journeyTag === b.journeyTag && a.rateTag === b.rateTag
}

/**
 * Walks one list's rows in order and cuts a new section at every heading, and at every item whose
 * tags differ from the section it would otherwise join. A heading followed immediately by
 * differently-tagged items therefore becomes a heading-only section plus a headless block -- which
 * is exactly how that data reads on a quote, the heading applying to the blocks beneath it.
 */
export function groupIntoSections(
  lines: readonly EditableInclusionLine[],
  list: InclusionList,
): InclusionSection[] {
  const sections: InclusionSection[] = []
  let current: InclusionSection | null = null

  for (const line of lines) {
    if (line.list !== list) continue

    if (line.kind === "heading") {
      current = {
        id: line.id,
        heading: line.text,
        journeyTag: line.journeyTag,
        rateTag: line.rateTag,
        items: [],
      }
      sections.push(current)
      continue
    }

    if (current == null || !sameTags(current, line)) {
      current = {
        id: line.id,
        heading: null,
        journeyTag: line.journeyTag,
        rateTag: line.rateTag,
        items: [],
      }
      sections.push(current)
    }

    current.items.push({ id: line.id, text: line.text })
  }

  return sections
}

/**
 * Sections back to storage rows, each stamped with its section's tags. A blank heading emits no
 * heading row and a blank item line emits nothing, so an empty section disappears on save rather
 * than persisting as an empty bullet.
 */
export function flattenSections(
  sections: readonly InclusionSection[],
  list: InclusionList,
): EditableInclusionLine[] {
  const lines: EditableInclusionLine[] = []

  for (const section of sections) {
    const heading = section.heading?.trim() ?? ""
    if (heading.length > 0) {
      lines.push({
        id: section.id,
        list,
        kind: "heading",
        text: heading,
        journeyTag: section.journeyTag,
        rateTag: section.rateTag,
      })
    }

    for (const item of section.items) {
      const text = item.text.trim()
      if (text.length === 0) continue
      lines.push({
        id: item.id,
        list,
        kind: "item",
        text,
        journeyTag: section.journeyTag,
        rateTag: section.rateTag,
      })
    }
  }

  return lines
}

/**
 * Replaces just `list`'s rows in the shared two-list array, leaving the other list's rows in place
 * and in order. Both lists live in one `SupplierFormState.inclusionLines` array, so an editor for
 * one must never drop the other's rows.
 */
export function replaceListLines(
  lines: readonly EditableInclusionLine[],
  list: InclusionList,
  nextForList: readonly EditableInclusionLine[],
): EditableInclusionLine[] {
  const others = lines.filter((line) => line.list !== list)
  return list === "inclusions" ? [...nextForList, ...others] : [...others, ...nextForList]
}

/** Total rows one list's sections will persist -- checked against the API's 200-row cap. */
export function countSectionLines(sections: readonly InclusionSection[]): number {
  return sections.reduce((total, section) => {
    const heading = (section.heading?.trim() ?? "").length > 0 ? 1 : 0
    const items = section.items.filter((item) => item.text.trim().length > 0).length
    return total + heading + items
  }, 0)
}
