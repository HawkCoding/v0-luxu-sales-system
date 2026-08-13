const SURNAME_PARTICLES = new Set([
  "al",
  "ap",
  "bin",
  "da",
  "das",
  "del",
  "della",
  "den",
  "der",
  "di",
  "dos",
  "du",
  "ibn",
  "la",
  "le",
  "ten",
  "ter",
  "van",
  "von",
])

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function capitalize(value: string): string {
  const characters = Array.from(value)
  if (characters.length === 0) return ""

  const [first, ...rest] = characters
  return `${first.toLocaleUpperCase()}${rest.join("")}`
}

/** Has capitals and no lower case at all — "SMITH", "QA", "JP". */
function isAllCaps(value: string): boolean {
  return value === value.toLocaleUpperCase() && value !== value.toLocaleLowerCase()
}

/**
 * A capital followed later by lower case — "MacLeod", "O'Brien", "DeVries". Distinguishes
 * a deliberately cased name from a shouted one, which never returns to lower case.
 */
function hasLowerCaseAfterCapital(value: string): boolean {
  let seenCapital = false
  for (const character of value) {
    if (character !== character.toLocaleLowerCase()) {
      seenCapital = true
    } else if (seenCapital && character !== character.toLocaleUpperCase()) {
      return true
    }
  }
  return false
}

/**
 * Re-case a token only when the whole name was shouted — supplier CSVs arrive as
 * "JOHN SMITH" and must be cleaned up. In any other name the capitals are the
 * user's own, so acronyms ("QA", "JP") and internal capitals ("MacLeod") survive
 * verbatim instead of collapsing to "Qa" / "Macleod" on client-facing documents.
 */
function normalizeSubToken(value: string, shouted: boolean): string {
  if (!value) return ""
  if (!shouted && (isAllCaps(value) || hasLowerCaseAfterCapital(value))) return value

  const lower = value.toLocaleLowerCase()
  if (!lower) return ""

  if (lower.startsWith("o'") && lower.length > 2) {
    return `O'${capitalize(lower.slice(2))}`
  }

  if (lower.startsWith("mc") && lower.length > 2) {
    return `Mc${capitalize(lower.slice(2))}`
  }

  return lower
    .split("'")
    .map((part) => capitalize(part))
    .join("'")
}

function normalizeToken(value: string, shouted: boolean): string {
  return value
    .split("-")
    .map((part) => normalizeSubToken(part, shouted))
    .join("-")
}

/** True when the name carries capitals but no lower case anywhere — a shouted CSV row. */
function isShoutedName(value: string): boolean {
  return isAllCaps(value)
}

export function normalizeFirstName(value: string): string {
  const compact = normalizeWhitespace(value).normalize("NFC")
  if (!compact) return ""

  const shouted = isShoutedName(compact)
  return compact
    .split(" ")
    .map((token) => normalizeToken(token, shouted))
    .join(" ")
}

export interface CustomerNameFields {
  title?: string | null
  first_name?: string | null
  last_name?: string | null
}

/**
 * How a customer is addressed in client-facing documents and emails: title + surname
 * ("Mr Smith"). Falls back to the full name when no title is on record, so a greeting
 * never reads as a bare surname. Returns "" when nothing is on record — callers supply
 * their own placeholder.
 */
export function formatCustomerSalutation(customer: CustomerNameFields | null | undefined): string {
  const title = customer?.title?.trim() ?? ""
  const firstName = customer?.first_name?.trim() ?? ""
  const lastName = customer?.last_name?.trim() ?? ""

  if (title && lastName) return `${title} ${lastName}`

  return [firstName, lastName].filter(Boolean).join(" ")
}

export function normalizeLastName(value: string): string {
  const compact = normalizeWhitespace(value).normalize("NFC")
  if (!compact) return ""

  const tokens = compact.split(" ")
  const lastIndex = tokens.length - 1
  const shouted = isShoutedName(compact)

  return tokens
    .map((token, index) => {
      const lower = token.toLocaleLowerCase()
      if (index < lastIndex && SURNAME_PARTICLES.has(lower)) return lower
      return normalizeToken(token, shouted)
    })
    .join(" ")
}
