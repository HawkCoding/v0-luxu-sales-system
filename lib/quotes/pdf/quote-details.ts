import type { VoucherServiceBlock } from "@/lib/generate-voucher"
import { nestBulletLines, parseBulletLines, type NestedBulletLine } from "@/lib/inclusions/bullet-lines"
import { displayRouteName } from "@/lib/routes/route-name"

/** One line of the "Travel Package Details" page (see nestBulletLines for the levels). */
export type QuoteDetailBullet = NestedBulletLine

/** One supplier's row on the details page: its name (and tour type) left, its bullets right. */
export interface QuoteDetailSection {
  title: string[]
  bullets: QuoteDetailBullet[]
}

/** A hotel's own description, one bullet per paragraph (the supplier form's line breaks). */
function paragraphBullets(text: string | null | undefined): QuoteDetailBullet[] {
  return (text ?? "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => ({ text: paragraph, level: 1 as const, bold: false }))
}

function sectionFor(block: VoucherServiceBlock): QuoteDetailSection | null {
  const d = block.serviceData
  const supplier = block.contactDetails.name?.trim() || block.title?.trim() || null
  const inclusions = nestBulletLines(parseBulletLines(d.inclusions))

  switch (block.serviceType) {
    case "hotel": {
      // The hotel's own description replaces its facility list when it has one, exactly as the
      // quote's itinerary always chose between them.
      const description = paragraphBullets(block.contactDetails.description)
      const bullets = description.length > 0 ? description : inclusions
      return supplier && bullets.length > 0 ? { title: [supplier], bullets } : null
    }
    case "train":
      // "Rovos Rail Includes:" — the route already heads the first page's journey box, so the
      // details page names the operator alone (client markup, 2026-09-29), unless the operator has
      // two different lists to tell apart (see buildQuoteDetailSections).
      return supplier && inclusions.length > 0 ? { title: [`${supplier} Includes:`], bullets: inclusions } : null
    case "tour": {
      const tourType = d.suiteType?.trim() || null
      const bullets = [...paragraphBullets(d.itineraryDescription), ...inclusions]
      const title = [supplier, tourType].filter((part): part is string => Boolean(part))
      return title.length > 0 && bullets.length > 0 ? { title, bullets } : null
    }
    case "transfer":
      // Transfer suppliers are never named to the client; their inclusions (rare) go unnamed too.
      return inclusions.length > 0 ? { title: ["Transfers"], bullets: inclusions } : null
    default:
      return supplier && inclusions.length > 0 ? { title: [supplier], bullets: inclusions } : null
  }
}

/**
 * The quote's second section — "Travel Package Details" — one row per supplier that has anything
 * to say: a hotel's description, a train's inclusions, a tour's itinerary. Blocks arrive in
 * itinerary order; a supplier booked twice (two stays, an outbound and return train on the same
 * route) prints once.
 */
export function buildQuoteDetailSections(blocks: VoucherServiceBlock[]): QuoteDetailSection[] {
  const sections: Array<{ section: QuoteDetailSection; trainRoute: string | null }> = []
  const seen = new Set<string>()
  for (const block of blocks) {
    const section = sectionFor(block)
    if (!section) continue
    const key = `${section.title.join("|")}#${section.bullets.map((bullet) => bullet.text).join("|")}`
    if (seen.has(key)) continue
    seen.add(key)
    sections.push({ section, trainRoute: block.serviceType === "train" ? displayRouteName(block.serviceData.route) : null })
  }

  // One operator with two different inclusion lists (e.g. a short and a long journey) would print
  // two identical "Rovos Rail Includes:" headings; only then does each name its route beneath.
  const headingCounts = new Map<string, number>()
  for (const { section } of sections) {
    const heading = section.title[0]
    headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1)
  }
  return sections.map(({ section, trainRoute }) =>
    trainRoute && (headingCounts.get(section.title[0]) ?? 0) > 1
      ? { ...section, title: [...section.title, trainRoute] }
      : section,
  )
}
