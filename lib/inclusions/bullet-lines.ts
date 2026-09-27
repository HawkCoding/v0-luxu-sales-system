// Client-facing inclusion/exclusion bullets are stored as a plain string[] — one
// entry per line, typed one-per-line in the supplier form. A line starting with
// `#` is a subheading rather than a bullet, so a long list can be broken into
// sections ("# Onboard", "# Off-train") without the section label reading as
// just another dash item. The marker is an editing convention only: it is
// stripped before anything reaches a client-facing document.

/** A leading run of `#` plus the spaces after it — the subheading marker. */
const HEADING_MARKER = /^#+\s*/

export type BulletLineKind = "heading" | "item" | "warning"

export interface BulletLine {
  kind: BulletLineKind
  text: string
}

/**
 * Splits the one-per-line editor value into the stored string[]. A leading dash/bullet character
 * is dropped (pasted lists often carry them); a leading `#` is kept — that's the subheading marker.
 */
export function splitBulletLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
}

/** True when the stored line is marked as a subheading. */
export function isHeadingLine(raw: string): boolean {
  return HEADING_MARKER.test(raw.trim())
}

/** The line's visible text — the `#` marker is never shown to the client. */
export function stripBulletMarker(raw: string): string {
  return raw.trim().replace(HEADING_MARKER, "").trim()
}

export function parseBulletLine(raw: string): BulletLine {
  return {
    kind: isHeadingLine(raw) ? "heading" : "item",
    text: stripBulletMarker(raw),
  }
}

/** Parses stored lines in order, dropping blanks and bare markers with no text after them. */
export function parseBulletLines(values: readonly string[] | null | undefined): BulletLine[] {
  return (values ?? []).map(parseBulletLine).filter((line) => line.text.length > 0)
}

/**
 * The same list flattened onto one line for the voucher's single-value "Included" row: items
 * under a subheading are grouped behind it ("Onboard: a, b") and groups are separated with "; ".
 * Items appearing before the first subheading keep their own leading group. A subheading with no
 * items under it contributes nothing — a bare label reads as noise in a flat list.
 */
export function formatBulletLinesInline(values: readonly string[] | null | undefined): string {
  const groups: string[] = []
  let heading: string | null = null
  let items: string[] = []

  const flush = () => {
    if (items.length === 0) return
    // A subheading typed with its own colon ("Onboard:") must not print "Onboard::".
    groups.push(heading ? `${heading.replace(/:\s*$/, "")}: ${items.join(", ")}` : items.join(", "))
    items = []
  }

  for (const line of parseBulletLines(values)) {
    if (line.kind === "heading") {
      flush()
      heading = line.text
      continue
    }
    items.push(line.text)
  }
  flush()

  return groups.join("; ")
}

/** A bullet line placed in a nested list: 1 = filled dot, 2 = ring one step in, 0 = unbulleted
 * bold label heading a group of subheadings. */
export interface NestedBulletLine {
  text: string
  level: 0 | 1 | 2
  bold: boolean
}

/**
 * Supplier inclusions as the SA-Rail PDF templates nest them: a `#` subheading prints bold at the
 * first level ("Onboard:"), the items under it one level in; items before any subheading stay at
 * the first level. A subheading followed straight away by another ("Long Journeys" over "Onboard:"
 * and "Off-train:") heads a group rather than a list, so it becomes an unbulleted label instead of
 * a bullet with nothing under it. Once a list has such a group, its other top-level subheadings
 * ("Short Journeys", before the first group) are labels of the same rank, their items plain dots,
 * so a sibling section never reads as one of the group's own subheadings.
 */
export function nestBulletLines(lines: readonly BulletLine[]): NestedBulletLine[] {
  const headsGroup = (index: number) => lines[index].kind === "heading" && lines[index + 1]?.kind === "heading"
  const hasGroups = lines.some((_, index) => headsGroup(index))
  let inGroup = false
  let underHeading = false
  return lines.map((line, index) => {
    if (line.kind === "heading") {
      if (headsGroup(index) || (hasGroups && !inGroup)) {
        inGroup = inGroup || headsGroup(index)
        underHeading = false
        return { text: line.text, level: 0, bold: true }
      }
      underHeading = true
      return { text: line.text, level: 1, bold: true }
    }
    return { text: line.text, level: underHeading ? 2 : 1, bold: false }
  })
}
