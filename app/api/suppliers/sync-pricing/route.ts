/**
 * POST /api/suppliers/sync-pricing
 *
 * Protected by a server-only token (`SUPPLIER_SYNC_TOKEN`).
 * Fetches SA-Rail pricing pages, parses them, and upserts into Supabase:
 *   locations → suppliers → packages → routes → suite_types → rate_cards
 *
 * Idempotency: every entity is identified by a stable natural key so repeated
 * runs update rather than duplicate records.
 */

import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { scrapeSaRail } from "@/lib/suppliers/sa-rail-scraper"
import type { ScrapeResult } from "@/lib/suppliers/sa-rail-scraper"

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function isAuthorized(req: Request): boolean {
  const token = process.env.SUPPLIER_SYNC_TOKEN
  if (!token) {
    // If no token is configured, reject for safety
    return false
  }
  return req.headers.get("x-sync-token") === token
}

// ---------------------------------------------------------------------------
// Sync counters
// ---------------------------------------------------------------------------

interface SyncCounts {
  locations: number
  suppliers: number
  packages: number
  routes: number
  suiteTypes: number
  rateCards: number
}

// ---------------------------------------------------------------------------
// Upsert helpers — each uses a stable natural key for ON CONFLICT
// ---------------------------------------------------------------------------

async function upsertLocations(
  supabase: ReturnType<typeof createServiceClient>,
  locations: ScrapeResult["locations"]
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>()
  if (!locations.length) return idMap

  const { data, error } = await supabase
    .from("locations")
    .upsert(
      locations.map(loc => ({
        name: loc.name,
        country: loc.country,
      })),
      { onConflict: "name", ignoreDuplicates: false }
    )
    .select("id, name")

  if (error) throw new Error(`upsertLocations: ${error.message}`)
  for (const row of data ?? []) {
    idMap.set(row.name, row.id)
  }
  return idMap
}

async function upsertSuppliers(
  supabase: ReturnType<typeof createServiceClient>,
  suppliers: ScrapeResult["suppliers"]
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>()
  if (!suppliers.length) return idMap

  const { data, error } = await supabase
    .from("suppliers")
    .upsert(
      suppliers.map(s => ({
        name: s.name,
        kind: s.kind,
        website: s.website ?? null,
        email: s.email ?? null,
        phone: s.phone ?? null,
        active: true,
      })),
      { onConflict: "name", ignoreDuplicates: false }
    )
    .select("id, name")

  if (error) throw new Error(`upsertSuppliers: ${error.message}`)
  for (const row of data ?? []) {
    idMap.set(row.name, row.id)
  }
  return idMap
}

async function upsertPackages(
  supabase: ReturnType<typeof createServiceClient>,
  packages: ScrapeResult["packages"],
  supplierIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>()
  if (!packages.length) return idMap

  const rows = packages
    .map(p => {
      const supplierId = supplierIdMap.get(p.supplierName)
      if (!supplierId) return null
      return {
        name: p.name,
        supplier_id: supplierId,
        description: p.description ?? null,
        active: true,
      }
    })
    .filter(Boolean) as { name: string; supplier_id: string; description: string | null; active: boolean }[]

  if (!rows.length) return idMap

  const { data, error } = await supabase
    .from("packages")
    .upsert(rows, { onConflict: "name,supplier_id", ignoreDuplicates: false })
    .select("id, name, supplier_id")

  if (error) throw new Error(`upsertPackages: ${error.message}`)
  for (const row of data ?? []) {
    idMap.set(row.name, row.id)
  }
  return idMap
}

async function upsertRoutes(
  supabase: ReturnType<typeof createServiceClient>,
  routes: ScrapeResult["routes"],
  packageIdMap: Map<string, string>,
  locationIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>()
  if (!routes.length) return idMap

  const rows = routes
    .map(r => {
      const packageId = packageIdMap.get(r.packageName)
      const originId = locationIdMap.get(r.originName)
      const destinationId = locationIdMap.get(r.destinationName)
      if (!packageId || !originId || !destinationId) return null
      return {
        name: r.name,
        package_id: packageId,
        origin_location_id: originId,
        destination_location_id: destinationId,
        active: true,
      }
    })
    .filter(Boolean) as {
    name: string
    package_id: string
    origin_location_id: string
    destination_location_id: string
    active: boolean
  }[]

  if (!rows.length) return idMap

  const { data, error } = await supabase
    .from("routes")
    .upsert(rows, { onConflict: "name,package_id", ignoreDuplicates: false })
    .select("id, name, package_id")

  if (error) throw new Error(`upsertRoutes: ${error.message}`)
  for (const row of data ?? []) {
    idMap.set(`${row.package_id}|${row.name}`, row.id)
  }
  return idMap
}

async function upsertSuiteTypes(
  supabase: ReturnType<typeof createServiceClient>,
  suiteTypes: ScrapeResult["suiteTypes"],
  packageIdMap: Map<string, string>
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>()
  if (!suiteTypes.length) return idMap

  const rows = suiteTypes
    .map(st => {
      const packageId = packageIdMap.get(st.packageName)
      if (!packageId) return null
      return {
        name: st.name,
        package_id: packageId,
        active: true,
      }
    })
    .filter(Boolean) as { name: string; package_id: string; active: boolean }[]

  if (!rows.length) return idMap

  const { data, error } = await supabase
    .from("suite_types")
    .upsert(rows, { onConflict: "name,package_id", ignoreDuplicates: false })
    .select("id, name, package_id")

  if (error) throw new Error(`upsertSuiteTypes: ${error.message}`)
  for (const row of data ?? []) {
    idMap.set(`${row.package_id}|${row.name}`, row.id)
  }
  return idMap
}

async function upsertRateCards(
  supabase: ReturnType<typeof createServiceClient>,
  rateCards: ScrapeResult["rateCards"],
  packageIdMap: Map<string, string>,
  routeIdMap: Map<string, string>,
  suiteTypeIdMap: Map<string, string>
): Promise<number> {
  if (!rateCards.length) return 0

  const rows = rateCards
    .map(rc => {
      const packageId = packageIdMap.get(rc.packageName)
      if (!packageId) return null
      const routeKey = `${packageId}|${rc.routeName}`
      const suiteKey = `${packageId}|${rc.suiteTypeName}`
      const routeId = routeIdMap.get(routeKey) ?? null
      const suiteTypeId = suiteTypeIdMap.get(suiteKey)
      if (!suiteTypeId) return null
      return {
        package_id: packageId,
        route_id: routeId,
        suite_type_id: suiteTypeId,
        price_per_person: rc.pricePerPerson,
        currency: rc.currency,
        valid_from: rc.validFrom,
        valid_to: rc.validTo,
      }
    })
    .filter(Boolean) as {
    package_id: string
    route_id: string | null
    suite_type_id: string
    price_per_person: number
    currency: string
    valid_from: string
    valid_to: string
  }[]

  if (!rows.length) return 0

  const { error } = await supabase
    .from("rate_cards")
    .upsert(rows, {
      onConflict: "package_id,suite_type_id,route_id,valid_from",
      ignoreDuplicates: false,
    })

  if (error) throw new Error(`upsertRateCards: ${error.message}`)
  return rows.length
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = new Date().toISOString()

  try {
    // 1. Scrape SA-Rail pages
    const scraped = await scrapeSaRail()

    // 2. Get Supabase service client
    const supabase = createServiceClient()

    // 3. Upsert in dependency order:
    //    locations → suppliers → packages → routes → suite_types → rate_cards

    const locationIdMap = await upsertLocations(supabase, scraped.locations)
    const supplierIdMap = await upsertSuppliers(supabase, scraped.suppliers)
    const packageIdMap = await upsertPackages(supabase, scraped.packages, supplierIdMap)
    const routeIdMap = await upsertRoutes(supabase, scraped.routes, packageIdMap, locationIdMap)
    const suiteTypeIdMap = await upsertSuiteTypes(supabase, scraped.suiteTypes, packageIdMap)
    const rateCardsCount = await upsertRateCards(
      supabase,
      scraped.rateCards,
      packageIdMap,
      routeIdMap,
      suiteTypeIdMap
    )

    const counts: SyncCounts = {
      locations: locationIdMap.size,
      suppliers: supplierIdMap.size,
      packages: packageIdMap.size,
      routes: routeIdMap.size,
      suiteTypes: suiteTypeIdMap.size,
      rateCards: rateCardsCount,
    }

    return NextResponse.json({
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      counts,
      warnings: scraped.warnings,
    })
  } catch (err: unknown) {
    console.error("[sync-pricing] error:", err)
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error during sync",
        startedAt,
      },
      { status: 500 }
    )
  }
}
