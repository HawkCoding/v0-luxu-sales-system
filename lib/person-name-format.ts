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

function normalizeSubToken(value: string): string {
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

function normalizeToken(value: string): string {
  return value
    .split("-")
    .map((part) => normalizeSubToken(part))
    .join("-")
}

export function normalizeFirstName(value: string): string {
  const compact = normalizeWhitespace(value).normalize("NFC")
  if (!compact) return ""

  return compact
    .split(" ")
    .map((token) => normalizeToken(token))
    .join(" ")
}

export function normalizeLastName(value: string): string {
  const compact = normalizeWhitespace(value).normalize("NFC")
  if (!compact) return ""

  const tokens = compact.split(" ")
  const lastIndex = tokens.length - 1

  return tokens
    .map((token, index) => {
      const lower = token.toLocaleLowerCase()
      if (index < lastIndex && SURNAME_PARTICLES.has(lower)) return lower
      return normalizeToken(token)
    })
    .join(" ")
}
