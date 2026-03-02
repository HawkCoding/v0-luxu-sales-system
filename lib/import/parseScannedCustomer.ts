export interface ParsedCustomer {
  title: string | null
  firstName: string
  lastName: string
  email: string
  phone: string | null
  country: string | null
  confidence: Record<string, "high" | "low">
  rawText: string
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function extractLabeledValue(text: string, labels: string[]): string | null {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${escaped.join("|")})\\s*[:\\-]\\s*(.+)`, "im")
  const match = text.match(regex)
  if (!match?.[1]) return null
  return normalize(match[1])
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = normalize(fullName).split(" ").filter(Boolean)
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  }
}

function fallbackNameFromText(text: string): { firstName: string; lastName: string } | null {
  const nameLineMatch = text.match(
    /(?:^|\n)\s*([A-Z][a-z]{1,30})\s+([A-Z][a-z]{1,30})(?:\s|$)/m
  )
  if (!nameLineMatch) return null
  return { firstName: nameLineMatch[1], lastName: nameLineMatch[2] }
}

export function parseScannedCustomer(text: string): ParsedCustomer {
  const confidence: Record<string, "high" | "low"> = {}
  const cleaned = text.replace(/\r/g, "")

  // Labeled-form-first extraction for high confidence.
  const titleValue = extractLabeledValue(cleaned, ["Title", "Prefix"])
  const fullNameValue = extractLabeledValue(cleaned, ["Name", "Full Name", "Client Name"])
  const firstNameValue = extractLabeledValue(cleaned, ["First Name", "Given Name"])
  const lastNameValue = extractLabeledValue(cleaned, ["Last Name", "Surname", "Family Name"])
  const emailValue = extractLabeledValue(cleaned, ["Email", "Email Address", "E-mail"])
  const phoneValue = extractLabeledValue(cleaned, ["Phone", "Telephone", "Cell", "Mobile", "Contact Number"])
  const countryValue = extractLabeledValue(cleaned, ["Country", "Nationality"])

  let firstName = ""
  let lastName = ""
  if (firstNameValue || lastNameValue) {
    firstName = firstNameValue ?? ""
    lastName = lastNameValue ?? ""
    if (firstName) confidence["firstName"] = "high"
    if (lastName) confidence["lastName"] = "high"
  } else if (fullNameValue) {
    const split = splitName(fullNameValue)
    firstName = split.firstName
    lastName = split.lastName
    if (firstName) confidence["firstName"] = "high"
    if (lastName) confidence["lastName"] = "high"
  }

  let email = ""
  if (emailValue) {
    const fromLabel = emailValue.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    email = fromLabel?.[0] ?? ""
    if (email) confidence["email"] = "high"
  }
  if (!email) {
    const fallbackEmail = cleaned.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    email = fallbackEmail?.[0] ?? ""
    if (email) confidence["email"] = "low"
  }

  let phone: string | null = null
  if (phoneValue) {
    const fromLabel = phoneValue.match(/\+?[0-9][0-9()\s-]{7,18}[0-9]/)
    phone = fromLabel ? normalize(fromLabel[0]) : null
    if (phone) confidence["phone"] = "high"
  }
  if (!phone) {
    const fallbackPhone = cleaned.match(/\+?[0-9][0-9()\s-]{7,18}[0-9]/)
    phone = fallbackPhone ? normalize(fallbackPhone[0]) : null
    if (phone) confidence["phone"] = "low"
  }

  if (!firstName || !lastName) {
    const fallbackName = fallbackNameFromText(cleaned)
    if (fallbackName) {
      firstName = firstName || fallbackName.firstName
      lastName = lastName || fallbackName.lastName
      if (firstName && !confidence["firstName"]) confidence["firstName"] = "low"
      if (lastName && !confidence["lastName"]) confidence["lastName"] = "low"
    }
  }

  const title = titleValue ? normalize(titleValue) : null
  if (title) confidence["title"] = "high"
  const country = countryValue ? normalize(countryValue) : null
  if (country) confidence["country"] = "high"

  return {
    title,
    firstName: normalize(firstName),
    lastName: normalize(lastName),
    email: normalize(email).toLowerCase(),
    phone,
    country,
    confidence,
    rawText: text,
  }
}
