import type { DraftSuiteUnit } from "@/lib/suites/draft-suite-unit"

export interface ParsedDraft {
  customer: {
    title: string
    firstName: string
    surname: string
    email: string
    phone: string
    country: string
    province: string
  }
  trip: {
    supplierId?: string
    supplier: string
    route: string
    departureDate: string
    purpose: 'quote' | 'availability' | 'reservation'
    packageOption: string
    hotelOption: string
    /** Pre-departure, post-departure, or no hotel stay. '' when the email didn't say. */
    hotelPhase: 'pre' | 'post' | 'none' | ''
    /** Whether the customer asked to extend their stay. null when the email didn't say. */
    extendStay: boolean | null
    flightBooking: string
    flightDepartureDate: string
  }
  guests: {
    adults: number
    /** Total minors: the form's "No of Children" + "No of Infants" combined. Age buckets --
     *  not the customer's own child/infant labelling -- decide which are infants downstream;
     *  see lib/packages/passenger-totals.ts. */
    children: number
    /** Every minor's age (Child N: Age / Infant N: Age), ascending. Shorter than `children`
     *  when the form omitted some ages. */
    childAges: number[]
    suites: number
    /**
     * The customer's own suite wording, verbatim, one entry per requested suite. NOT a DB name --
     * resolving these to suite_types + config axes needs the supplier's vocabulary and happens in
     * lib/suites/, outside this pure parser.
     */
    suitePhrases: string[]
    /** Compatibility view of `suitePhrases[0]`; raw wording, not a resolved suite type name. */
    suiteType: string
    /** Resolved units. Populated by the resolver step, never by the parser. */
    suiteUnits?: DraftSuiteUnit[]
  }
  additionalServices: {
    requested: boolean
    /** Free text describing what was asked for, e.g. "My mom's birthday". */
    details: string
  }
  /** False only when an Acceptance/Terms block is present and does not say accept. True when
   *  no such block exists at all (e.g. the public web form, which gates acceptance itself). */
  termsAccepted: boolean
  notes: string
  formFields: {
    title: string
    country: string
    province: string
    packageOption: string
    hotelOption: string
    flightBooking: string
    flightDepartureDate: string
    /**
     * Raw wording preserved alongside the fields above so the UI can show what the customer
     * actually wrote even when the resolver couldn't match it to a database row (route, supplier,
     * suite). Never a substitute for the resolved id -- only a fallback for display.
     */
    direction: string
    supplier: string
    departureDateRaw: string
    suitePhrases: string[]
    childAges: number[]
    hotelPhase: 'pre' | 'post' | 'none' | ''
    extendStay: boolean | null
    additionalServicesDetails: string
  }
  confidence: {
    [key: string]: 'high' | 'low'
  }
  rawText: string
  linkedCustomerId?: string
}

export interface ValidationResult {
  isValid: boolean
  missingRequired: string[]
  warnings: string[]
}

export interface ValidateDraftOptions {
  /**
   * Review-modal only. The modal has the supplier vocabulary loaded, so a supplier that never
   * resolved to an id is a real blocker there -- the parsed wording alone is not enough to link
   * the booking. The automated importer resolves supplier ids later (lib/inbound-email/
   * import-booking.ts) and must keep gating on parsed text, or every inbound email would flip to
   * needs-review on a supplier it is perfectly capable of resolving.
   */
  requireResolvedSupplier?: boolean
}

const REQUIRED_FIELDS = [
  'customer.firstName',
  'customer.surname',
  'customer.email',
  'customer.country',
  'trip.supplier',
  'trip.route',
  'trip.departureDate',
  'guests.adults',
  'guests.suites'
]

const FORM_FIELD_LABEL_PATTERNS = [
  /^title$/i,
  /^name$/i,
  /^first\s*name$/i,
  /^forename$/i,
  /^surname$/i,
  /^last\s*name$/i,
  /^family\s*name$/i,
  /^email$/i,
  /^country$/i,
  /^province$/i,
  /^direction$/i,
  /^departure\s*date$/i,
  /^(?:no\.?|number)\s*of\s*adults?$/i,
  /^(?:no\.?|number)\s*of\s*(?:children|child|kids?)$/i,
  /^(?:no\.?|number)\s*of\s*infants?$/i,
  /^(?:child|infant)s?\s*\d*\s*:?\s*age$/i,
  /^(?:contact\s*number|phone|telephone|mobile|cell(?:phone)?)$/i,
  /^(?:no\.?|number)\s*of\s*suites?$/i,
  /^suite\s*type(?:\s*\d+)?$/i,
  /^package\s*options?$/i,
  /^package$/i,
  /^hotel$/i,
  /^hotel\s*options$/i,
  /^extend\s+your\s+stay$/i,
  /^would\s+you\s+like\s+to\s+add\s+additional\s+travel\s+services/i,
  /^flight\s*booking$/i,
  /^flight\s*departure\s*date$/i,
  /^acceptance$/i,
  /^please\s+indicate\s+the\s+purpose\s+of\s+your\s+request$/i,
  /^contact\s+information$/i,
  /^.+\s+information$/i,
  /^additional\s+pre\s+and\s+post\s+train\s+travel\s+services$/i,
]

// Some Gravity Forms notification templates wrap labels in markdown-style emphasis
// (`*Title*`, `*Email*`) instead of a plain trailing colon. Strip wrapper punctuation from
// BOTH ends -- stripping only the trailing end (the old behaviour) left `*Title*` as `*Title`,
// which matched no label pattern and silently blanked every labelled field on those emails.
function normalizeLabel(line: string): string {
  return line.replace(/^[\s*_|:]+/, '').replace(/[\s*_|:]+$/, '').trim()
}

/**
 * Some templates glue a section header directly onto the next label with no line break
 * (e.g. "Personal Contact InformationTitle"). Strips a recognised "... Information" prefix
 * so the trailing label is still matchable. Returns the input unchanged when no such prefix
 * is present.
 */
function stripGluedSectionHeader(label: string): string {
  const match = label.match(/^.+?\s+Information(.+)$/i)
  return match ? match[1] : label
}

function isFormFieldLabel(line: string): boolean {
  const label = stripGluedSectionHeader(normalizeLabel(line))
  return FORM_FIELD_LABEL_PATTERNS.some((pattern) => pattern.test(label))
}

function getLabeledFieldValue(text: string, labelPatterns: RegExp[]): string {
  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const sameLineMatch = rawLine.trim().match(/^(.+?)\s*[:|]\s*(.+)$/)
    if (!sameLineMatch) continue

    const label = stripGluedSectionHeader(normalizeLabel(sameLineMatch[1]))
    const value = sameLineMatch[2].trim()
    if (value && labelPatterns.some((pattern) => pattern.test(label))) {
      return value
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const label = stripGluedSectionHeader(normalizeLabel(lines[index]))
    if (!labelPatterns.some((pattern) => pattern.test(label))) continue

    const value = lines.slice(index + 1).map((line) => line.trim()).find((line) => line.length > 0)
    if (value && !isFormFieldLabel(value)) {
      return value
    }
  }

  return ''
}

/**
 * Reads Gravity Forms' indexed age rows ("Child 1: Age" / "Infant 2: Age"), whether the number
 * sits on the same line (after the internal colon that `getLabeledFieldValue`'s same-line
 * splitter would otherwise mistake for the label/value separator) or on the next line. The
 * child/infant wording itself is discarded -- which bucket an age falls into is decided later,
 * by age bucket (lib/packages/passenger-totals.ts), not by how the customer labelled it.
 */
function extractMinorAges(text: string): number[] {
  const lines = text.split(/\r?\n/)
  const ages: number[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const label = normalizeLabel(lines[index])
    const match = label.match(/^(?:child|infant)s?\s*\d*\s*:?\s*age\s*[:|]?\s*(.*)$/i)
    if (!match) continue

    const sameLineValue = match[1].trim()
    const value = sameLineValue
      ? sameLineValue
      : lines.slice(index + 1).map((line) => line.trim()).find((line) => line.length > 0) ?? ''

    if (/^\d+$/.test(value)) {
      const age = parseInt(value, 10)
      if (age >= 0 && age <= 30) ages.push(age)
    }
  }

  return ages.sort((a, b) => a - b)
}

/**
 * Leading words that are request framing or quantities rather than part of the suite description.
 * Stripped iteratively from the front, since prose stacks them ("would like 1 Royal double suite").
 */
const SUITE_PHRASE_LEADING_NOISE = new Set([
  'a', 'an', 'the', 'x', 'need', 'needs', 'want', 'wants', 'would', 'like', 'love', 'book',
  'booking', 'please', 'quote', 'for', 'in', 'on', 'we', 'i', 'us', 'my', 'our', 'prefer',
  'prefers', 'request', 'requesting', 'reserve', 'is', 'are', 'be', 'looking', 'after', 'to',
  'and', 'travelling', 'travel', 'require', 'requires', 'take', 'want,',
])

function cleanSuitePhrase(value: string): string {
  const words = value
    .replace(/[.,;:!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")

  let start = 0
  while (start < words.length) {
    const word = words[start].toLowerCase().replace(/[.,;:!?]+$/, "")
    if (SUITE_PHRASE_LEADING_NOISE.has(word) || /^\d+$/.test(word)) {
      start += 1
      continue
    }
    break
  }

  return words.slice(start).join(" ").trim()
}

/**
 * Pulls the customer's raw suite wording out of the email. Structured `Suite Type` / `Suite Type 2`
 * labels win (the Gravity Forms shape); otherwise falls back to a sentence-scoped capture around
 * the word "suite" for prose enquiries. Returns wording exactly as written -- never a DB name.
 */
function extractSuitePhrases(text: string): string[] {
  const phrases: string[] = []

  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const sameLineMatch = lines[index].trim().match(/^(.+?)\s*[:|]\s*(.+)$/)
    if (sameLineMatch && /^suite\s*type(?:\s*\d+)?$/i.test(stripGluedSectionHeader(normalizeLabel(sameLineMatch[1])))) {
      const cleaned = cleanSuitePhrase(sameLineMatch[2])
      if (cleaned) phrases.push(cleaned)
      continue
    }

    if (!/^suite\s*type(?:\s*\d+)?$/i.test(stripGluedSectionHeader(normalizeLabel(lines[index])))) continue

    const value = lines.slice(index + 1).map((line) => line.trim()).find((line) => line.length > 0)
    if (value && !isFormFieldLabel(value)) {
      const cleaned = cleanSuitePhrase(value)
      if (cleaned) phrases.push(cleaned)
    }
  }

  if (phrases.length > 0) return phrases

  // Prose fallback: the noun phrase ending in "suite", plus any trailing "with ..." qualifier
  // that carries the bathroom/layout wording (e.g. "Deluxe Twin with shower").
  const proseMatch = text.match(
    /\b((?:[A-Za-z0-9/'-]+[ \t]+){0,4}suites?(?:[ \t]+with[ \t]+(?:[A-Za-z0-9/'-]+[ \t]*){1,4})?)/i,
  )
  if (proseMatch) {
    const cleaned = cleanSuitePhrase(proseMatch[1])
    if (cleaned && !/^suites?$/i.test(cleaned)) return [cleaned]
  }

  // "Deluxe Twin with shower" style wording that never says "suite" at all.
  const withQualifierMatch = text.match(
    /\b((?:[A-Za-z0-9/'-]+[ \t]+){1,3}with[ \t]+(?:shower|bath|bathroom)[A-Za-z0-9/' \t-]{0,20})/i,
  )
  if (withQualifierMatch) {
    const cleaned = cleanSuitePhrase(withQualifierMatch[1])
    if (cleaned) return [cleaned]
  }

  return []
}

const MONTH_ABBREVIATIONS: { [key: string]: string } = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

/** Parses the first recognisable date out of `text` (ISO, "15 Mar 2026", or "15/03/2026"). */
function extractDateString(text: string): string {
  const isoMatch = text.match(/\b(202[4-9]|203[0-9])-([0-1][0-9])-([0-3][0-9])\b/)
  if (isoMatch) return isoMatch[0]

  const dateMatch = text.match(/\b([0-3]?[0-9])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+?(202[4-9]|203[0-9])\b/i)
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0')
    const month = MONTH_ABBREVIATIONS[dateMatch[2].toLowerCase().slice(0, 3)]
    const year = dateMatch[3]
    if (month) return `${year}-${month}-${day}`
  }

  const slashMatch = text.match(/\b([0-3]?[0-9])\/([0-1]?[0-9])\/([0-9]{4})\b/)
  if (slashMatch) {
    // Assume day/month/year for international.
    const day = slashMatch[1].padStart(2, '0')
    const month = slashMatch[2].padStart(2, '0')
    const year = slashMatch[3]
    return `${year}-${month}-${day}`
  }

  return ''
}

/**
 * Same date parse as `extractDateString`, but for scanning the whole message body rather than a
 * labelled field's value -- an unambiguous ISO date found anywhere is high confidence, but a date
 * inferred from prose ("Mar 15, 2026", "15/03/2026") is not.
 */
function extractDateWithConfidence(text: string): { value: string; confidence: 'high' | 'low' } {
  const isoMatch = text.match(/\b(202[4-9]|203[0-9])-([0-1][0-9])-([0-3][0-9])\b/)
  if (isoMatch) return { value: isoMatch[0], confidence: 'high' }

  return { value: extractDateString(text), confidence: 'low' }
}

export function parseEmailDraft(text: string): ParsedDraft {
  const confidence: { [key: string]: 'high' | 'low' } = {}
  const title = getLabeledFieldValue(text, [/^title$/i])
  const country = getLabeledFieldValue(text, [/^country$/i])
  const province = getLabeledFieldValue(text, [/^province$/i, /^region$/i])
  const purposeValue = getLabeledFieldValue(text, [/^please\s+indicate\s+the\s+purpose\s+of\s+your\s+request$/i])
  // When the customer declines a package, some templates omit the label entirely and emit only
  // a bare bullet line ("I do not require a package") -- fall back to that literal phrase so the
  // choice isn't lost. The Rovos template also labels this field just "Package" rather than
  // "Package Options".
  const packageOption =
    getLabeledFieldValue(text, [/^package\s*options?$/i, /^package$/i]) ||
    (/\bI do not require a package\b/i.test(text) ? 'I do not require a package' : '')
  const hotelOption = getLabeledFieldValue(text, [/^hotel\s*options?$/i])
  const flightBooking = getLabeledFieldValue(text, [/^flight\s*booking$/i])
  const flightDepartureDateValue = getLabeledFieldValue(text, [/^flight\s*departure\s*date$/i])

  // "Hotel" states whether a stay is pre- or post-departure (or none) -- distinct from
  // "Hotel Options", which names the property. Needed so the auto-built hotel leg gets the
  // right service date instead of defaulting to the rail departure date.
  const hotelPhaseValue = getLabeledFieldValue(text, [/^hotel$/i])
  let hotelPhase: 'pre' | 'post' | 'none' | '' = ''
  if (/pre/i.test(hotelPhaseValue)) {
    hotelPhase = 'pre'
    confidence['trip.hotelPhase'] = 'high'
  } else if (/post/i.test(hotelPhaseValue)) {
    hotelPhase = 'post'
    confidence['trip.hotelPhase'] = 'high'
  } else if (/^none$|^no$/i.test(hotelPhaseValue)) {
    hotelPhase = 'none'
    confidence['trip.hotelPhase'] = 'high'
  }

  const extendStayValue = getLabeledFieldValue(text, [/^extend\s+your\s+stay$/i])
  let extendStay: boolean | null = null
  if (/^yes$/i.test(extendStayValue)) {
    extendStay = true
    confidence['trip.extendStay'] = 'high'
  } else if (/^no$/i.test(extendStayValue)) {
    extendStay = false
    confidence['trip.extendStay'] = 'high'
  }

  const additionalServicesDetails = getLabeledFieldValue(text, [
    /^would\s+you\s+like\s+to\s+add\s+additional\s+travel\s+services/i,
  ])
  const additionalServicesRequested = Boolean(additionalServicesDetails)
  if (additionalServicesDetails) confidence['additionalServices.requested'] = 'high'

  if (title) confidence['customer.title'] = 'high'
  if (country) confidence['customer.country'] = 'high'
  if (province) confidence['customer.province'] = 'high'
  
  // Extract email (high confidence if found)
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  const email = emailMatch?.[0].replace(/[.,;:!?]+$/, "") || ''
  if (emailMatch) confidence['customer.email'] = 'high'
  
  // Extract phone: a labelled "Contact Number" (or Phone/Telephone/Mobile/Cell) field is
  // trustworthy on its own -- only fall back to scanning the whole body for a bare number
  // when no such label answered it, so an unrelated 10+ digit string elsewhere in the email
  // (a reference number, a date run together) can't win instead.
  const phoneLabelValue = getLabeledFieldValue(text, [
    /^contact\s*number$/i,
    /^phone$/i,
    /^telephone$/i,
    /^mobile$/i,
    /^cell(?:phone)?$/i,
  ])
  const phoneMatch = text.match(/\+?27[\s-]?[0-9]{2}[\s-]?[0-9]{3}[\s-]?[0-9]{4}|\+?[0-9]{10,15}/)
  let phone = ''
  if (phoneLabelValue.replace(/\D/g, '').length >= 9) {
    phone = phoneLabelValue
    confidence['customer.phone'] = 'high'
  } else if (phoneMatch) {
    phone = phoneMatch[0]
    confidence['customer.phone'] = 'high'
  }
  
  // Extract name: structured form labels first, signature fallback second.
  const firstNameLabelValue = getLabeledFieldValue(text, [/^first\s*name$/i, /^forename$/i])
  const nameLabelValue = getLabeledFieldValue(text, [/^name$/i])
  const surnameLabelValue = getLabeledFieldValue(text, [/^surname$/i, /^last\s*name$/i, /^family\s*name$/i])
  // A separate Surname label already answers "what's the surname" -- the Name field is the
  // customer's full given name as-is (which may include a middle name, e.g. "Phyllis Cecilia")
  // and must not be split. Splitting only applies when Surname is unlabelled and Name has to
  // carry both parts.
  const fullNameLabelMatch = !firstNameLabelValue && !surnameLabelValue && nameLabelValue
    ? nameLabelValue.match(/^([A-Za-z][A-Za-z'-]*)\s+([A-Za-z][A-Za-z'-]*)$/)
    : null
  const singleNameLabelMatch = !firstNameLabelValue && !fullNameLabelMatch && nameLabelValue
    ? nameLabelValue.match(/^([A-Za-z][A-Za-z'-]*)$/)
    : null
  const signatureNameMatch = !firstNameLabelValue && !surnameLabelValue && !fullNameLabelMatch && !singleNameLabelMatch
    ? text.match(/(?:regards|sincerely|cheers|thanks|best),?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)/i)
    : null

  const firstName =
    firstNameLabelValue ||
    (surnameLabelValue && nameLabelValue ? nameLabelValue : '') ||
    fullNameLabelMatch?.[1] ||
    singleNameLabelMatch?.[1] ||
    signatureNameMatch?.[1] ||
    ''
  const surname = surnameLabelValue || fullNameLabelMatch?.[2] || signatureNameMatch?.[2] || ''
  if (firstNameLabelValue || (surnameLabelValue && nameLabelValue) || fullNameLabelMatch || singleNameLabelMatch) {
    confidence['customer.firstName'] = 'high'
  } else if (signatureNameMatch) {
    confidence['customer.firstName'] = 'low'
  }
  if (surnameLabelValue || fullNameLabelMatch) {
    confidence['customer.surname'] = 'high'
  } else if (signatureNameMatch) {
    confidence['customer.surname'] = 'low'
  }

  let purpose: 'quote' | 'availability' | 'reservation' = 'quote'
  if (/availability/i.test(purposeValue)) {
    purpose = 'availability'
    confidence['trip.purpose'] = 'high'
  } else if (/reservation|booking/i.test(purposeValue)) {
    purpose = 'reservation'
    confidence['trip.purpose'] = 'high'
  } else if (/quote/i.test(purposeValue)) {
    purpose = 'quote'
    confidence['trip.purpose'] = 'high'
  }
  
  // Extract supplier (high confidence) - Only Rovos Rail and Blue Train
  let supplier = ''
  if (/rovos/i.test(text)) {
    supplier = 'Rovos Rail'
    confidence['trip.supplier'] = 'high'
  } else if (/blue\s*train/i.test(text)) {
    supplier = 'Blue Train'
    confidence['trip.supplier'] = 'high'
  }
  
  // Extract route/direction (medium confidence)
  let route = ''
  const routePatterns = [
    /pretoria\s+to\s+cape\s*town/i,
    /cape\s*town\s+to\s+pretoria/i,
    /pretoria\s+to\s+victoria\s*falls/i,
    /victoria\s*falls\s+to\s+pretoria/i,
    /pretoria\s+to\s+durban/i,
    /durban\s+to\s+pretoria/i,
    /pretoria\s+to\s+swakopmund/i,
    /swakopmund\s+to\s+pretoria/i,
    /cape\s*town\s+to\s+dar\s*es\s*salaam/i,
    /dar\s*es\s*salaam\s+to\s+cape\s*town/i
  ]
  
  for (const pattern of routePatterns) {
    const match = text.match(pattern)
    if (match) {
      route = match[0].replace(/\s+/g, ' ').trim()
      // Capitalize
      route = route.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      confidence['trip.route'] = 'high'
      break
    }
  }
  
  // Extract departure date (various formats). A value read from the labelled "Departure Date"
  // field is trustworthy regardless of which format it's written in -- low confidence is reserved
  // for dates inferred from free-form prose, not for a form field the customer filled in directly.
  const departureDateLabelValue = getLabeledFieldValue(text, [/^departure\s*date$/i])
  const departureDateFromLabel = departureDateLabelValue ? extractDateString(departureDateLabelValue) : ''
  let departureDate = ''
  if (departureDateFromLabel) {
    departureDate = departureDateFromLabel
    confidence['trip.departureDate'] = 'high'
  } else {
    const departureDateFromText = extractDateWithConfidence(text)
    if (departureDateFromText.value) {
      departureDate = departureDateFromText.value
      confidence['trip.departureDate'] = departureDateFromText.confidence
    }
  }
  
  // Extract adults (high confidence if explicit)
  let adults = 0
  const adultsLabelValue = getLabeledFieldValue(text, [
    /^(?:no\.?|number)\s*of\s*adults?$/i,
    /^(?:no\.?|number)\s*of\s*passengers?$/i,
    /^adults?$/i,
    /^passengers?$/i,
    /^pax$/i,
    /^people$/i,
    /^guests?$/i,
    /^travell?ers?$/i,
  ])
  const adultsInlineMatch = text.match(
    /(\d+)\s*(?:adults?|passengers?|pax|people|guests?|travell?ers?)/i
  )
  if (/^\d+$/.test(adultsLabelValue)) {
    adults = parseInt(adultsLabelValue)
    confidence['guests.adults'] = 'high'
  } else if (adultsInlineMatch) {
    adults = parseInt(adultsInlineMatch[1])
    confidence['guests.adults'] = 'high'
  } else {
    // Infer from "myself and my wife" = 2
    if (/myself\s+and\s+my\s+(wife|husband|partner)/i.test(text)) {
      adults = 2
      confidence['guests.adults'] = 'low'
    } else if (/for\s+myself/i.test(text) && !/and/i.test(text)) {
      adults = 1
      confidence['guests.adults'] = 'low'
    }
  }
  
  // Extract children + infants. Both count as minors on the booking -- "no_of_children" is the
  // *total*, and which of them turn out to be infants is decided downstream by age bucket
  // (lib/packages/passenger-totals.ts), not by how the customer happened to label them. Labelled
  // fields win when present; the old bare "(\d+) child/kid" scan is kept only as a fallback for
  // prose enquiries that never had a structured "No of Children" line, and can't misfire on a
  // "Child 1: Age" row since that has no digit immediately before the word.
  let children = 0
  const childrenLabelValue = getLabeledFieldValue(text, [
    /^(?:no\.?|number)\s*of\s*(?:children|child|kids?)$/i,
    /^children$/i,
  ])
  const infantsLabelValue = getLabeledFieldValue(text, [
    /^(?:no\.?|number)\s*of\s*infants?$/i,
    /^infants?$/i,
  ])
  const hasChildrenLabel = /^\d+$/.test(childrenLabelValue)
  const hasInfantsLabel = /^\d+$/.test(infantsLabelValue)
  if (hasChildrenLabel || hasInfantsLabel) {
    children = (hasChildrenLabel ? parseInt(childrenLabelValue) : 0) + (hasInfantsLabel ? parseInt(infantsLabelValue) : 0)
    confidence['guests.children'] = 'high'
  } else {
    const childrenMatch = text.match(/(\d+)\s*(child|kid)/i)
    if (childrenMatch) {
      children = parseInt(childrenMatch[1])
      confidence['guests.children'] = 'high'
    }
  }

  const childAges = extractMinorAges(text)
  if (childAges.length > 0) confidence['guests.childAges'] = 'high'

  // Extract suites. Deliberately NOT defaulted to 1 when unstated: an invented suite count
  // silently manufactures a room nobody asked for. Unstated stays 0 and is reported as a
  // missing field instead.
  let suites = 0
  const suitesLabelValue = getLabeledFieldValue(text, [
    /^(?:no\.?|number)\s*of\s*suites?$/i,
    /^suites?$/i,
  ])
  const suitesInlineMatch = text.match(/(\d+)[ \t]+(?:x[ \t]+)?(?:[A-Za-z-]+[ \t]+){0,3}suite/i)
  if (/^\d+$/.test(suitesLabelValue)) {
    suites = parseInt(suitesLabelValue)
    confidence['guests.suites'] = 'high'
  } else if (suitesInlineMatch) {
    suites = parseInt(suitesInlineMatch[1])
    confidence['guests.suites'] = 'high'
  }

  // Capture the customer's own suite wording verbatim. Matching it to real suite_types and
  // config axes is the resolver's job (lib/suites/) -- it needs the supplier's vocabulary from
  // the DB, which this pure parser has no access to. Synthesising names here is what produced
  // composite strings like "Deluxe Twin Suite" that exist in no supplier's vocabulary.
  const suitePhrases = extractSuitePhrases(text)
  if (suitePhrases.length > 0) confidence['guests.suiteType'] = 'high'

  // Terms acceptance: only treated as declined when an Acceptance/Terms block exists and its
  // value doesn't say accept. No such block at all (the public web form gates this itself, and
  // some templates omit the section entirely) stays accepted rather than blocking the import.
  const acceptanceValue = getLabeledFieldValue(text, [
    /^acceptance$/i,
    /^terms\s*(?:and|&)\s*conditions$/i,
  ])
  const termsAccepted = acceptanceValue ? /accept/i.test(acceptanceValue) : true
  if (acceptanceValue) confidence['termsAccepted'] = 'high'

  // Notes: everything not explicitly extracted
  const notes = text

  return {
    customer: {
      title,
      firstName,
      surname,
      email,
      phone,
      country,
      province
    },
    trip: {
      supplier,
      route,
      departureDate,
      purpose,
      packageOption,
      hotelOption,
      hotelPhase,
      extendStay,
      flightBooking,
      flightDepartureDate: flightDepartureDateValue
    },
    guests: {
      adults,
      children,
      childAges,
      suites,
      suitePhrases,
      suiteType: suitePhrases[0] ?? ''
    },
    additionalServices: {
      requested: additionalServicesRequested,
      details: additionalServicesDetails
    },
    termsAccepted,
    notes,
    formFields: {
      title,
      country,
      province,
      packageOption,
      hotelOption,
      flightBooking,
      flightDepartureDate: flightDepartureDateValue,
      direction: route,
      supplier,
      departureDateRaw: departureDate,
      suitePhrases,
      childAges,
      hotelPhase,
      extendStay,
      additionalServicesDetails
    },
    confidence,
    rawText: text
  }
}

/**
 * A supplier counts as present only when the caller's evidence bar is met: the review modal can
 * demand the resolved foreign key, everyone else settles for the parsed wording. See
 * ValidateDraftOptions for why this is per-caller rather than global.
 */
function hasSupplier(draft: ParsedDraft, options?: ValidateDraftOptions): boolean {
  return options?.requireResolvedSupplier ? Boolean(draft.trip.supplierId) : Boolean(draft.trip.supplier)
}

export function validateDraft(draft: ParsedDraft, options?: ValidateDraftOptions): ValidationResult {
  const missingRequired: string[] = []
  const warnings: string[] = []

  // Check required fields
  if (!draft.customer.firstName) missingRequired.push('First name (Customer)')
  if (!draft.customer.surname) missingRequired.push('Surname (Customer)')
  if (!draft.customer.country) missingRequired.push('Country')
  if (!draft.customer.email && !draft.customer.phone) {
    missingRequired.push('Email or Phone (Customer)')
  }
  if (!hasSupplier(draft, options)) missingRequired.push('Supplier')
  if (!draft.trip.route) missingRequired.push('Route / Direction')
  if (!draft.trip.departureDate) missingRequired.push('Departure date')
  if (!draft.guests.adults || draft.guests.adults < 1) missingRequired.push('Adults')
  if (!draft.guests.suites || draft.guests.suites < 1) missingRequired.push('Suites')

  // Suite type is reported but NOT required: an enquiry saves with it blank rather than being
  // blocked, and the hard gate stays where it already was -- quote build, which refuses to price
  // a leg with no suite type (lib/quotes/build-from-package.ts).
  const unresolvedSuites = (draft.guests.suiteUnits ?? []).filter((unit) => !unit.suiteTypeId)
  if (draft.guests.suiteUnits && unresolvedSuites.length > 0) {
    warnings.push(
      unresolvedSuites.length === 1
        ? 'Suite type not identified — select one before building a quote'
        : `${unresolvedSuites.length} suite types not identified — select them before building a quote`,
    )
  }
  
  // Check low confidence fields
  Object.entries(draft.confidence).forEach(([field, conf]) => {
    if (conf === 'low') {
      const fieldName = field.split('.').pop() || field
      warnings.push(`${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} parsed with low confidence`)
    }
  })
  
  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    warnings
  }
}

export function countRequiredComplete(
  draft: ParsedDraft,
  options?: ValidateDraftOptions,
): { completed: number; total: number } {
  let completed = 0
  const total = REQUIRED_FIELDS.length

  if (draft.customer.firstName) completed++
  if (draft.customer.surname) completed++
  if (draft.customer.email || draft.customer.phone) completed++
  if (draft.customer.country) completed++
  if (hasSupplier(draft, options)) completed++
  if (draft.trip.route) completed++
  if (draft.trip.departureDate) completed++
  if (draft.guests.adults > 0) completed++
  if (draft.guests.suites > 0) completed++
  
  return { completed, total }
}
