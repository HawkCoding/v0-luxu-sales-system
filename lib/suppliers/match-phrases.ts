import type { SupplierKind } from "@/lib/types"

/**
 * The wording an enquiry email is scanned for to decide which supplier it is about.
 *
 * A supplier's stored name and the name the customer-facing form uses are rarely the same string.
 * "Kruger Shalati - Train on the Bridge" arrives as "New submission from Kruger Shalati Enquiry",
 * and a whole-name scan matches none of it -- the brand is the first segment, the rest is the
 * property's descriptive tail. So every supplier answers to its full name AND to that leading
 * brand segment, and an admin can override both by typing explicit phrases on the supplier page
 * (suppliers.email_match_phrases), the same blank-means-default contract as suite_phrase_pattern.
 *
 * The word-boundary discipline from buildOperatorPattern is kept exactly: a phrase matches only as
 * whole adjacent words. That is what stops the surname in "Rovos Rail SA Specials 2026 - Kruger"
 * from resolving to Kruger Shalati -- "Kruger Shalati" needs both tokens, adjacent.
 */

export interface SupplierMatcher {
  name: string
  kind: SupplierKind
  /** Raw suppliers.email_match_phrases; null/blank falls back to phrases derived from the name. */
  emailMatchPhrases?: string | null
}

/** Separators that split a supplier's brand from its descriptive tail. */
const BRAND_TAIL_SEPARATOR = /\s+[-–—]\s+|\s+\(/

/**
 * Phrases to scan for, longest first. Explicit phrases replace the derived ones outright: an admin
 * who types wording is stating what to look for, not adding to a guess.
 */
export function deriveSupplierMatchPhrases(supplier: SupplierMatcher): string[] {
  const explicit = (supplier.emailMatchPhrases ?? "")
    .split(",")
    .map((phrase) => phrase.trim())
    .filter(Boolean)

  const phrases = explicit.length > 0 ? explicit : derivedPhrases(supplier.name)

  return dedupe(phrases).sort((a, b) => barePhraseLength(b) - barePhraseLength(a))
}

function derivedPhrases(name: string): string[] {
  const full = name.trim()
  if (!full) return []

  const brand = full.split(BRAND_TAIL_SEPARATOR)[0]?.trim() ?? ""
  // A single-word brand ("Rovos") is too weak to scan for on its own -- it would fire on any
  // sentence mentioning the word. Two adjacent tokens is the floor.
  const brandIsSpecificEnough = brand.length > 0 && brand !== full && countWords(brand) >= 2

  return brandIsSpecificEnough ? [full, brand] : [full]
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

/** Length ignoring a leading article, so ordering matches buildSupplierPhrasePattern's tolerance. */
function barePhraseLength(phrase: string): number {
  return phrase.trim().replace(/^the\s+/i, "").length
}

function dedupe(phrases: string[]): string[] {
  const seen = new Set<string>()
  return phrases.filter((phrase) => {
    const key = phrase.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Word-boundary matcher treating a leading definite article as optional on both sides: the supplier
 * row reads "The Blue Train" but every Blue Train enquiry writes plain "Blue Train". The article is
 * the only tolerance allowed; anything looser starts guessing between suppliers.
 */
export function buildSupplierPhrasePattern(phrase: string): RegExp {
  const bare = phrase.trim().replace(/^the\s+/i, "")
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\b(?:the\\s+)?${escaped}\\b`, "i")
}

export interface SupplierMatch {
  name: string
  kind: SupplierKind
  /** The phrase that actually matched -- useful for explaining a resolution in review. */
  phrase: string
}

/**
 * The first supplier whose wording appears in `text`, scanned longest-phrase-first across all
 * suppliers so a longer name wins over a shorter one it contains. Returns null rather than a guess.
 */
export function matchSupplierInText(
  text: string,
  suppliers: readonly SupplierMatcher[],
): SupplierMatch | null {
  if (!text.trim()) return null

  const entries = suppliers.flatMap((supplier) =>
    deriveSupplierMatchPhrases(supplier).map((phrase) => ({ supplier, phrase })),
  )
  entries.sort((a, b) => barePhraseLength(b.phrase) - barePhraseLength(a.phrase))

  for (const entry of entries) {
    if (buildSupplierPhrasePattern(entry.phrase).test(text)) {
      return { name: entry.supplier.name, kind: entry.supplier.kind, phrase: entry.phrase }
    }
  }

  return null
}
