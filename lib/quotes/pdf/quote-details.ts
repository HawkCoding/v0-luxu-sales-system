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

/**
 * The details page sets every line without a closing colon (client markup, 2026-10-06): a
 * supplier's own "# Onboard:" subheading prints "Onboard". Only a colon ending the line goes; one
 * inside it ("Check-in 14:00", "Note: smart casual") is part of the sentence and stays.
 */
export function withoutTrailingColon(text: string): string {
  return text.trim().replace(/(?:\s*:)+$/, "")
}

/**
 * Plain detail lines (the exclusions) without their closing colons, de-duplicated afterwards: the
 * colon is what told "Visas" and "Visas:" apart, so a match is only visible once it is gone.
 * Case-insensitive, first spelling wins, blank lines drop out.
 */
export function uniqueDetailLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const text = withoutTrailingColon(line)
    const key = text.replace(/\s+/g, " ").toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

/** The section with every title line and bullet passed through withoutTrailingColon; a line left
 * empty (a bare ":") drops out, and so does a section left with no title or no bullets. */
function withoutLabelColons(section: QuoteDetailSection): QuoteDetailSection | null {
  const title = section.title.map(withoutTrailingColon).filter(Boolean)
  const bullets = section.bullets
    .map((bullet) => ({ ...bullet, text: withoutTrailingColon(bullet.text) }))
    .filter((bullet) => bullet.text.length > 0)
  return title.length > 0 && bullets.length > 0 ? { title, bullets } : null
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
  // Stripped here too, so a name typed "Rovos Rail:" never reads "Rovos Rail: Inclusions".
  const supplier =
    withoutTrailingColon(block.contactDetails.name ?? "") || withoutTrailingColon(block.title ?? "") || null
  const inclusions = nestBulletLines(parseBulletLines(d.inclusions))

  switch (block.serviceType) {
    case "hotel": {
      const description = paragraphBullets(block.contactDetails.description)
      // A hotel sold as a product in its own right (Kruger Shalati) reads like the trains:
      // "Kruger Shalati Inclusions", its brand without the " - Train on the Bridge" tail, listing
      // its inclusions (client request 2026-10-07).
      if (d.isStandaloneProduct && supplier) {
        const brand = supplier.split(" - ")[0].trim() || supplier
        const bullets = inclusions.length > 0 ? inclusions : description
        return bullets.length > 0 ? { title: [`${brand} Inclusions`], bullets } : null
      }
      // An add-on hotel's own description replaces its facility list when it has one, exactly as
      // the quote's itinerary always chose between them.
      const bullets = description.length > 0 ? description : inclusions
      return supplier && bullets.length > 0 ? { title: [supplier], bullets } : null
    }
    case "train":
      // "Rovos Rail Inclusions" — the route already heads the first page's journey box, so the
      // details page names the operator alone (client markup, 2026-09-29; "Inclusions", no colon,
      // 2026-10-06), unless the operator has two different lists to tell apart (see
      // buildQuoteDetailSections).
      return supplier && inclusions.length > 0 ? { title: [`${supplier} Inclusions`], bullets: inclusions } : null
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
    const draft = sectionFor(block)
    const section = draft ? withoutLabelColons(draft) : null
    if (!section) continue
    const key = `${section.title.join("|")}#${section.bullets.map((bullet) => bullet.text).join("|")}`
    if (seen.has(key)) continue
    seen.add(key)
    const trainRoute = block.serviceType === "train" ? withoutTrailingColon(displayRouteName(block.serviceData.route) ?? "") : ""
    sections.push({ section, trainRoute: trainRoute || null })
  }

  // One operator with two different inclusion lists (e.g. a short and a long journey) would print
  // two identical "Rovos Rail Inclusions" headings; only then does each name its route beneath.
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
