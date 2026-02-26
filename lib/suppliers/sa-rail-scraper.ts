/**
 * SA-Rail website scraper
 *
 * Fetches and parses pricing/schedule information from sa-rail.co.za for
 * Rovos Rail and The Blue Train, returning normalized records that map onto
 * the Supabase schema:  suppliers → packages → routes → suite_types → rate_cards
 */

import * as cheerio from "cheerio"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScrapedSupplier {
  name: string
  kind: "train_operator"
  website: string
  email?: string
  phone?: string
}

export interface ScrapedPackage {
  supplierName: string
  name: string
  description?: string
}

export interface ScrapedRoute {
  packageName: string
  name: string
  originName: string
  destinationName: string
  durationNights?: string
}

export interface ScrapedSuiteType {
  packageName: string
  name: string
}

export interface ScrapedRateCard {
  packageName: string
  routeName: string
  suiteTypeName: string
  pricePerPerson: number
  currency: string
  validFrom: string
  validTo: string
}

export interface ScrapedLocation {
  name: string
  country: string
}

export interface ScrapeResult {
  suppliers: ScrapedSupplier[]
  packages: ScrapedPackage[]
  routes: ScrapedRoute[]
  suiteTypes: ScrapedSuiteType[]
  rateCards: ScrapedRateCard[]
  locations: ScrapedLocation[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// URL constants
// ---------------------------------------------------------------------------

const ROVOS_URL = "https://sa-rail.co.za/luxury-trains/rovos-rail/"
const BLUE_TRAIN_URL = "https://sa-rail.co.za/luxury-trains/blue-train/"
const FETCH_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Known route mapping: section id fragment → origin / destination city names
// The SA-Rail pages use CSS id anchors like #pretoria-vicfalls, #pretoria-capetown
// ---------------------------------------------------------------------------
const LOCATION_COUNTRY: Record<string, string> = {
  Pretoria: "South Africa",
  "Cape Town": "South Africa",
  "Victoria Falls": "Zimbabwe",
  Durban: "South Africa",
  "Dar Es Salaam": "Tanzania",
  "Walvis Bay": "Namibia",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCurrency(raw: string): { amount: number; currency: string } {
  const cleaned = raw.replace(/[\s']/g, "").trim()
  if (cleaned.startsWith("US$") || cleaned.startsWith("USD")) {
    const amount = parseFloat(cleaned.replace(/[^0-9.]/g, ""))
    return { amount: isNaN(amount) ? 0 : amount, currency: "USD" }
  }
  const amount = parseFloat(cleaned.replace(/[^0-9.]/g, ""))
  return { amount: isNaN(amount) ? 0 : amount, currency: "ZAR" }
}

/**
 * Parse a validity header like "01 Oct 2025 – 30 Sept 2026" or
 * "Rates 01 Oct 2026 – 30 Sep 2027" into ISO date strings.
 */
function parseValidityRange(text: string): { validFrom: string; validTo: string } | null {
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  }

  // Match: DD Mon YYYY – DD Mon YYYY  (with – or -)
  const match = text.match(
    /(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*[–\-]\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})/i
  )
  if (!match) return null

  const [, d1, m1, y1, d2, m2, y2] = match
  const mm1 = months[m1.toLowerCase()]
  const mm2 = months[m2.toLowerCase()]
  if (!mm1 || !mm2) return null

  return {
    validFrom: `${y1}-${mm1}-${d1.padStart(2, "0")}`,
    validTo: `${y2}-${mm2}-${d2.padStart(2, "0")}`,
  }
}

/**
 * Parse origin → destination from a heading like
 * "Pretoria – Victoria Falls (3 / 4 Nights)" or "Pretoria – Cape Town (3 Nights)"
 */
function parseRouteHeading(text: string): {
  origin: string
  destination: string
  durationLabel: string
  routeName: string
} | null {
  const m = text.match(/^(.+?)\s*[–\-]\s*(.+?)\s*(?:\((.+?)\))?$/)
  if (!m) return null

  const origin = m[1].trim()
  const destination = m[2].trim()
  const durationLabel = m[3]?.trim() ?? ""

  return {
    origin,
    destination,
    durationLabel,
    routeName: `${origin} – ${destination}`,
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "LuxusTravelBot/1.0 (+https://luxustravel.co.za)" },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Parse Rovos Rail page
// ---------------------------------------------------------------------------

function parseRovosRail(html: string, warnings: string[]): Omit<ScrapeResult, "warnings"> {
  const $ = cheerio.load(html)

  const suppliers: ScrapedSupplier[] = [
    {
      name: "Rovos Rail",
      kind: "train_operator",
      website: ROVOS_URL,
      phone: "+27 (0)21 100 3596",
      email: "info@sa-rail.co.za",
    },
  ]

  const packages: ScrapedPackage[] = [
    { supplierName: "Rovos Rail", name: "Rovos Rail", description: "Luxury train journeys across Southern Africa aboard Rovos Rail." },
  ]

  const routes: ScrapedRoute[] = []
  const suiteTypes: ScrapedSuiteType[] = []
  const rateCards: ScrapedRateCard[] = []
  const locationsSet = new Map<string, ScrapedLocation>()

  const knownSuites = new Set<string>()

  // The page has route sections, each with an h2 heading like "Pretoria – Cape Town (3 Nights)"
  // followed by schedule tables and rate tables.
  // We iterate every h2 inside the content area.

  $("h2").each((_, h2El) => {
    const headingText = $(h2El).text().trim()
    const parsed = parseRouteHeading(headingText)
    if (!parsed) return

    // Skip headings that don't look like route headings
    const { origin, destination, durationLabel, routeName } = parsed
    if (!origin || !destination) return

    // Ensure origin & destination are registered as locations
    const addLoc = (name: string) => {
      if (!locationsSet.has(name)) {
        locationsSet.set(name, {
          name,
          country: LOCATION_COUNTRY[name] ?? "South Africa",
        })
      }
    }
    addLoc(origin)
    addLoc(destination)

    const route: ScrapedRoute = {
      packageName: "Rovos Rail",
      name: routeName,
      originName: origin,
      destinationName: destination,
      durationNights: durationLabel || undefined,
    }

    // Avoid duplicate routes (the page lists the same route multiple times in reverse)
    if (!routes.find(r => r.name === routeName)) {
      routes.push(route)
    }

    // Walk the siblings after this h2 until the next h2 to find rate tables
    let sibling = $(h2El).parent().next()
    let depth = 0
    while (sibling.length && depth < 30) {
      depth++
      // Look for any table inside this sibling block
      sibling.find("table").addBack("table").each((_, tableEl) => {
        const tableText = $(tableEl).closest("h2, h3, p").first().text()

        // Check if this is a rates table by looking at the first row / caption
        const firstTh = $(tableEl).find("th").first().text().toLowerCase()
        const tableHtml = $.html(tableEl)

        // Validity range — look in the table's preceding sibling heading or caption
        let validityText = ""
        $(tableEl).prevAll("h2, h3, h4, p").each((_, el) => {
          const t = $(el).text()
          if (/\d{4}.*\d{4}/.test(t) && !validityText) validityText = t
        })
        // Also try checking a cell that spans
        $(tableEl).find("th[colspan], td[colspan]").each((_, el) => {
          const t = $(el).text()
          if (/\d{4}.*\d{4}/.test(t) && !validityText) validityText = t
        })

        const validity = validityText ? parseValidityRange(validityText) : null

        // Try to detect "per person sharing" rate tables
        const isRateTable =
          /per.?person|pullman|deluxe|royal|rate/i.test(tableHtml) &&
          /R\s*[\d']+|US\$\s*[\d']+/i.test(tableHtml)

        if (!isRateTable) return

        // Parse rows: Suite type | Price
        $(tableEl).find("tr").each((_, trEl) => {
          const cells = $(trEl).find("td")
          if (cells.length < 2) return

          const suiteRaw = $(cells[0]).text().trim()
          const priceRaw = $(cells[1]).text().trim()

          if (!suiteRaw || !priceRaw) return
          if (/supplement|single/i.test(suiteRaw)) return // skip single supplement rows

          const { amount, currency } = parseCurrency(priceRaw)
          if (amount <= 0) return

          // Normalise suite type name
          const suiteName = suiteRaw.replace(/\s+/g, " ").trim()
          if (!knownSuites.has(`Rovos Rail|${suiteName}`)) {
            suiteTypes.push({ packageName: "Rovos Rail", name: suiteName })
            knownSuites.add(`Rovos Rail|${suiteName}`)
          }

          const validFrom = validity?.validFrom ?? "2025-10-01"
          const validTo = validity?.validTo ?? "2026-09-30"

          // Deduplicate rate cards
          const key = `${routeName}|${suiteName}|${validFrom}|${validTo}`
          if (!rateCards.find(rc => `${rc.routeName}|${rc.suiteTypeName}|${rc.validFrom}|${rc.validTo}` === key)) {
            rateCards.push({
              packageName: "Rovos Rail",
              routeName,
              suiteTypeName: suiteName,
              pricePerPerson: amount,
              currency,
              validFrom,
              validTo,
            })
          }
        })
      })

      // Stop traversing if we hit another section heading
      const nextH2 = sibling.find("h2")
      if (nextH2.length) break
      sibling = sibling.next()
    }
  })

  if (routes.length === 0) {
    warnings.push("Rovos Rail: no routes extracted — page structure may have changed")
  }

  return {
    suppliers,
    packages,
    routes,
    suiteTypes,
    rateCards,
    locations: Array.from(locationsSet.values()),
  }
}

// ---------------------------------------------------------------------------
// Parse Blue Train page
// ---------------------------------------------------------------------------

function parseBlueTrain(html: string, warnings: string[]): Omit<ScrapeResult, "warnings"> {
  const $ = cheerio.load(html)

  const suppliers: ScrapedSupplier[] = [
    {
      name: "The Blue Train",
      kind: "train_operator",
      website: BLUE_TRAIN_URL,
      phone: "+27 (0)21 100 3596",
      email: "info@sa-rail.co.za",
    },
  ]

  const packages: ScrapedPackage[] = [
    { supplierName: "The Blue Train", name: "The Blue Train", description: "South Africa's iconic 5-star luxury train between Pretoria and Cape Town." },
  ]

  const routes: ScrapedRoute[] = [
    {
      packageName: "The Blue Train",
      name: "Pretoria – Cape Town",
      originName: "Pretoria",
      destinationName: "Cape Town",
      durationNights: "2 Nights",
    },
    {
      packageName: "The Blue Train",
      name: "Cape Town – Pretoria",
      originName: "Cape Town",
      destinationName: "Pretoria",
      durationNights: "2 Nights",
    },
  ]

  const locationsSet = new Map<string, ScrapedLocation>()
  locationsSet.set("Pretoria", { name: "Pretoria", country: "South Africa" })
  locationsSet.set("Cape Town", { name: "Cape Town", country: "South Africa" })

  const suiteTypes: ScrapedSuiteType[] = []
  const rateCards: ScrapedRateCard[] = []
  const knownSuites = new Set<string>()

  // Blue Train has rate tables for low/high season, both directions share the same table.
  // We parse them together — route is generic "Pretoria ↔ Cape Town" with one direction label.
  // We'll use the canonical "Pretoria – Cape Town" route for both (one-way price applies equally).

  const routeName = "Pretoria – Cape Town"

  // Blue Train rate tables look like:
  //   "2026 Rates (One Way)"
  //   Low Season: DD MMM – DD MMM
  //   De Luxe Suites | R xx
  //   Luxury Suites  | R xx

  $("table").each((_, tableEl) => {
    const tableHtml = $.html(tableEl)
    const isRateTable =
      /de.luxe|luxury|rate/i.test(tableHtml) &&
      /R[\d']+|R\s[\d']+/i.test(tableHtml)

    if (!isRateTable) return

    // Find validity context from preceding siblings
    let validityText = ""
    let seasonLabel = ""
    $(tableEl).prevAll("h2, h3, h4, p, div").slice(0, 6).each((_, el) => {
      const t = $(el).text()
      if (/\d{4}.*\d{4}/.test(t) && !validityText) validityText = t
      if (/(low|high)\s*season/i.test(t) && !seasonLabel) seasonLabel = t
    })

    const validity = validityText ? parseValidityRange(validityText) : null
    const validFrom = validity?.validFrom ?? "2026-01-01"
    const validTo = validity?.validTo ?? "2026-12-31"

    // Parse rows
    $(tableEl).find("tr").each((_, trEl) => {
      const cells = $(trEl).find("td")
      if (cells.length < 2) return

      const suiteRaw = $(cells[0]).text().trim()
      const priceRaw = $(cells[1]).text().trim()

      if (!suiteRaw || !priceRaw) return
      if (/supplement|single|season/i.test(suiteRaw)) return

      const { amount, currency } = parseCurrency(priceRaw)
      if (amount <= 0) return

      const suiteName = suiteRaw.replace(/\s+/g, " ").trim()
      if (!knownSuites.has(`The Blue Train|${suiteName}`)) {
        suiteTypes.push({ packageName: "The Blue Train", name: suiteName })
        knownSuites.add(`The Blue Train|${suiteName}`)
      }

      const key = `${routeName}|${suiteName}|${validFrom}|${validTo}`
      if (!rateCards.find(rc => `${rc.routeName}|${rc.suiteTypeName}|${rc.validFrom}|${rc.validTo}` === key)) {
        rateCards.push({
          packageName: "The Blue Train",
          routeName,
          suiteTypeName: suiteName,
          pricePerPerson: amount,
          currency,
          validFrom,
          validTo,
        })
      }
    })
  })

  if (rateCards.length === 0) {
    warnings.push("Blue Train: no rate cards extracted — page structure may have changed")
  }

  return {
    suppliers,
    packages,
    routes,
    suiteTypes,
    rateCards,
    locations: Array.from(locationsSet.values()),
  }
}

// ---------------------------------------------------------------------------
// Merge helper — avoids duplicates when combining Rovos + Blue Train results
// ---------------------------------------------------------------------------

function merge(a: Omit<ScrapeResult, "warnings">, b: Omit<ScrapeResult, "warnings">): Omit<ScrapeResult, "warnings"> {
  const dedup = <T>(arr: T[], key: (x: T) => string): T[] => {
    const seen = new Set<string>()
    return arr.filter(x => {
      const k = key(x)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  return {
    suppliers: dedup([...a.suppliers, ...b.suppliers], x => (x as ScrapedSupplier).name),
    packages: dedup([...a.packages, ...b.packages], x => `${(x as ScrapedPackage).supplierName}|${(x as ScrapedPackage).name}`),
    routes: dedup([...a.routes, ...b.routes], x => `${(x as ScrapedRoute).packageName}|${(x as ScrapedRoute).name}`),
    suiteTypes: dedup([...a.suiteTypes, ...b.suiteTypes], x => `${(x as ScrapedSuiteType).packageName}|${(x as ScrapedSuiteType).name}`),
    rateCards: dedup(
      [...a.rateCards, ...b.rateCards],
      x => `${(x as ScrapedRateCard).packageName}|${(x as ScrapedRateCard).routeName}|${(x as ScrapedRateCard).suiteTypeName}|${(x as ScrapedRateCard).validFrom}|${(x as ScrapedRateCard).validTo}`
    ),
    locations: dedup([...a.locations, ...b.locations], x => (x as ScrapedLocation).name),
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function scrapeSaRail(): Promise<ScrapeResult> {
  const warnings: string[] = []

  const [rovosHtml, blueTrainHtml] = await Promise.all([
    fetchHtml(ROVOS_URL).catch((e: unknown) => {
      warnings.push(`Failed to fetch Rovos Rail page: ${e instanceof Error ? e.message : String(e)}`)
      return ""
    }),
    fetchHtml(BLUE_TRAIN_URL).catch((e: unknown) => {
      warnings.push(`Failed to fetch Blue Train page: ${e instanceof Error ? e.message : String(e)}`)
      return ""
    }),
  ])

  const rovosResult = rovosHtml
    ? parseRovosRail(rovosHtml, warnings)
    : { suppliers: [], packages: [], routes: [], suiteTypes: [], rateCards: [], locations: [] }

  const blueTrainResult = blueTrainHtml
    ? parseBlueTrain(blueTrainHtml, warnings)
    : { suppliers: [], packages: [], routes: [], suiteTypes: [], rateCards: [], locations: [] }

  return { ...merge(rovosResult, blueTrainResult), warnings }
}
