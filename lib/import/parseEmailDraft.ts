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
    supplier: string
    route: string
    departureDate: string
    purpose: 'quote' | 'availability' | 'reservation'
    packageOption: string
    hotelOption: string
    flightBooking: string
    flightDepartureDate: string
  }
  guests: {
    adults: number
    children: number
    suites: number
    suiteType: string
  }
  notes: string
  formFields: {
    title: string
    country: string
    province: string
    packageOption: string
    hotelOption: string
    flightBooking: string
    flightDepartureDate: string
  }
  confidence: {
    [key: string]: 'high' | 'low'
  }
  rawText: string
}

export interface ValidationResult {
  isValid: boolean
  missingRequired: string[]
  warnings: string[]
}

const REQUIRED_FIELDS = [
  'customer.firstName',
  'customer.surname',
  'customer.email',
  'customer.country',
  'trip.supplier',
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
  /^contact\s*number$/i,
  /^email$/i,
  /^country$/i,
  /^province$/i,
  /^direction$/i,
  /^departure\s*date$/i,
  /^(?:no\.?|number)\s*of\s*adults?$/i,
  /^(?:no\.?|number)\s*of\s*suites?$/i,
  /^suite\s*type(?:\s*\d+)?$/i,
  /^package\s*options$/i,
  /^hotel\s*options$/i,
  /^flight\s*booking$/i,
  /^flight\s*departure\s*date$/i,
  /^acceptance$/i,
  /^please\s+indicate\s+the\s+purpose\s+of\s+your\s+request$/i,
  /^contact\s+information$/i,
  /^.+\s+information$/i,
  /^additional\s+pre\s+and\s+post\s+train\s+travel\s+services$/i,
]

function normalizeLabel(line: string): string {
  return line.replace(/[:|*]+$/g, '').trim()
}

function isFormFieldLabel(line: string): boolean {
  const label = normalizeLabel(line)
  return FORM_FIELD_LABEL_PATTERNS.some((pattern) => pattern.test(label))
}

function getLabeledFieldValue(text: string, labelPatterns: RegExp[]): string {
  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const sameLineMatch = rawLine.trim().match(/^(.+?)\s*[:|]\s*(.+)$/)
    if (!sameLineMatch) continue

    const label = normalizeLabel(sameLineMatch[1])
    const value = sameLineMatch[2].trim()
    if (value && labelPatterns.some((pattern) => pattern.test(label))) {
      return value
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const label = normalizeLabel(lines[index])
    if (!labelPatterns.some((pattern) => pattern.test(label))) continue

    const value = lines.slice(index + 1).map((line) => line.trim()).find((line) => line.length > 0)
    if (value && !isFormFieldLabel(value)) {
      return value
    }
  }

  return ''
}

export function parseEmailDraft(text: string): ParsedDraft {
  const confidence: { [key: string]: 'high' | 'low' } = {}
  const title = getLabeledFieldValue(text, [/^title$/i])
  const country = getLabeledFieldValue(text, [/^country$/i])
  const province = getLabeledFieldValue(text, [/^province$/i, /^region$/i])
  const purposeValue = getLabeledFieldValue(text, [/^please\s+indicate\s+the\s+purpose\s+of\s+your\s+request$/i])
  const packageOption = getLabeledFieldValue(text, [/^package\s*options$/i])
  const hotelOption = getLabeledFieldValue(text, [/^hotel\s*options?$/i])
  const flightBooking = getLabeledFieldValue(text, [/^flight\s*booking$/i])
  const flightDepartureDateValue = getLabeledFieldValue(text, [/^flight\s*departure\s*date$/i])

  if (title) confidence['customer.title'] = 'high'
  if (country) confidence['customer.country'] = 'high'
  if (province) confidence['customer.province'] = 'high'
  
  // Extract email (high confidence if found)
  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  const email = emailMatch?.[0].replace(/[.,;:!?]+$/, "") || ''
  if (emailMatch) confidence['customer.email'] = 'high'
  
  // Extract phone (high confidence for SA patterns)
  const phoneMatch = text.match(/\+?27[\s-]?[0-9]{2}[\s-]?[0-9]{3}[\s-]?[0-9]{4}|\+?[0-9]{10,15}/)
  const phone = phoneMatch?.[0] || ''
  if (phoneMatch) confidence['customer.phone'] = 'high'
  
  // Extract name: structured form labels first, signature fallback second.
  const firstNameLabelValue = getLabeledFieldValue(text, [/^first\s*name$/i, /^forename$/i])
  const nameLabelValue = getLabeledFieldValue(text, [/^name$/i])
  const surnameLabelValue = getLabeledFieldValue(text, [/^surname$/i, /^last\s*name$/i, /^family\s*name$/i])
  const fullNameLabelMatch = !firstNameLabelValue && nameLabelValue
    ? nameLabelValue.match(/^([A-Za-z][A-Za-z'-]*)\s+([A-Za-z][A-Za-z'-]*)$/)
    : null
  const singleNameLabelMatch = !firstNameLabelValue && !fullNameLabelMatch && nameLabelValue
    ? nameLabelValue.match(/^([A-Za-z][A-Za-z'-]*)$/)
    : null
  const signatureNameMatch = !firstNameLabelValue && !surnameLabelValue && !fullNameLabelMatch && !singleNameLabelMatch
    ? text.match(/(?:regards|sincerely|cheers|thanks|best),?\s*\n?\s*([A-Z][a-z]+)\s+([A-Z][a-z]+)/i)
    : null

  const firstName = firstNameLabelValue || fullNameLabelMatch?.[1] || singleNameLabelMatch?.[1] || signatureNameMatch?.[1] || ''
  const surname = surnameLabelValue || fullNameLabelMatch?.[2] || signatureNameMatch?.[2] || ''
  if (firstNameLabelValue || fullNameLabelMatch || singleNameLabelMatch) {
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
  
  // Extract departure date (various formats)
  let departureDate = ''
  // ISO format: 2026-05-15
  const isoMatch = text.match(/\b(202[4-9]|203[0-9])-([0-1][0-9])-([0-3][0-9])\b/)
  if (isoMatch) {
    departureDate = isoMatch[0]
    confidence['trip.departureDate'] = 'high'
  } else {
    // "15 Mar 2026" or "Mar 15, 2026"
    const dateMatch = text.match(/\b([0-3]?[0-9])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+?(202[4-9]|203[0-9])\b/i)
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0')
      const monthMap: { [key: string]: string } = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
      }
      const month = monthMap[dateMatch[2].toLowerCase().slice(0, 3)]
      const year = dateMatch[3]
    if (month) {
      departureDate = `${year}-${month}-${day}`
      confidence['trip.departureDate'] = 'low'
    }
    } else {
      // "15/03/2026" or "03/15/2026"
      const slashMatch = text.match(/\b([0-3]?[0-9])\/([0-1]?[0-9])\/([0-9]{4})\b/)
      if (slashMatch) {
        // Assume day/month/year for international
        const day = slashMatch[1].padStart(2, '0')
        const month = slashMatch[2].padStart(2, '0')
        const year = slashMatch[3]
        departureDate = `${year}-${month}-${day}`
        confidence['trip.departureDate'] = 'low'
      }
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
  
  // Extract children
  let children = 0
  const childrenMatch = text.match(/(\d+)\s*(child|kid)/i)
  if (childrenMatch) {
    children = parseInt(childrenMatch[1])
    confidence['guests.children'] = 'high'
  }
  
  // Extract suites
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
  } else if (adults > 0) {
    // Default to 1 suite if not specified
    suites = 1
    confidence['guests.suites'] = 'low'
  }
  
  // Extract suite type
  let suiteType = ''
  if (/royal/i.test(text)) {
    suiteType = 'Royal'
    confidence['guests.suiteType'] = 'high'
    if (/double|couple/i.test(text)) suiteType = 'Royal Double Suite'
    else if (/twin/i.test(text)) suiteType = 'Royal Twin Suite'
    else suiteType = 'Royal Double Suite'
  } else if (/deluxe/i.test(text)) {
    suiteType = 'Deluxe'
    confidence['guests.suiteType'] = 'high'
    if (/double|couple/i.test(text)) suiteType = 'Deluxe Double Suite'
    else if (/twin/i.test(text)) suiteType = 'Deluxe Twin Suite'
    else suiteType = 'Deluxe Double Suite'
  } else if (/pullman/i.test(text)) {
    suiteType = 'Pullman'
    confidence['guests.suiteType'] = 'high'
    if (/double|couple/i.test(text)) suiteType = 'Pullman Double Suite'
    else if (/twin/i.test(text)) suiteType = 'Pullman Twin Suite'
    else suiteType = 'Pullman Double Suite'
  } else if (/\bsuite\b/i.test(text)) {
    suiteType = 'Other'
    confidence['guests.suiteType'] = 'low'
  }
  
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
      flightBooking,
      flightDepartureDate: flightDepartureDateValue
    },
    guests: {
      adults,
      children,
      suites,
      suiteType
    },
    notes,
    formFields: {
      title,
      country,
      province,
      packageOption,
      hotelOption,
      flightBooking,
      flightDepartureDate: flightDepartureDateValue
    },
    confidence,
    rawText: text
  }
}

export function validateDraft(draft: ParsedDraft): ValidationResult {
  const missingRequired: string[] = []
  const warnings: string[] = []
  
  // Check required fields
  if (!draft.customer.firstName) missingRequired.push('First name (Customer)')
  if (!draft.customer.surname) missingRequired.push('Surname (Customer)')
  if (!draft.customer.country) missingRequired.push('Country')
  if (!draft.customer.email && !draft.customer.phone) {
    missingRequired.push('Email or Phone (Customer)')
  }
  if (!draft.trip.supplier) missingRequired.push('Supplier')
  if (!draft.trip.departureDate) missingRequired.push('Departure date')
  if (!draft.guests.adults || draft.guests.adults < 1) missingRequired.push('Adults')
  if (!draft.guests.suites || draft.guests.suites < 1) missingRequired.push('Suites')
  
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

export function countRequiredComplete(draft: ParsedDraft): { completed: number; total: number } {
  let completed = 0
  const total = REQUIRED_FIELDS.length
  
  if (draft.customer.firstName) completed++
  if (draft.customer.surname) completed++
  if (draft.customer.email || draft.customer.phone) completed++
  if (draft.customer.country) completed++
  if (draft.trip.supplier) completed++
  if (draft.trip.departureDate) completed++
  if (draft.guests.adults > 0) completed++
  if (draft.guests.suites > 0) completed++
  
  return { completed, total }
}
