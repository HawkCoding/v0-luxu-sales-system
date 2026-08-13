import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { CURRENCIES, type SupportedCurrency } from "@/lib/types"
import { BASE_CURRENCY } from "@/lib/money"
import { roundFxRate, type FxRateMap } from "@/lib/pricing/convert-currency"

/** ECB publishes against EUR, so we fetch EUR→everything once and derive the ZAR pairs from it
 *  rather than making one request per currency. */
const FRANKFURTER_BASE = "EUR"
const FRANKFURTER_URL = "https://api.frankfurter.app/latest"

/** How stale a cached rate may get before a read refreshes it in the background. ECB publishes
 *  once a working day, so anything under a day is already fresher than the source. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

export interface FxRateRow {
  currency: SupportedCurrency
  /** How many base-currency units one `currency` buys. */
  rate: number
  asOf: string
  source: "frankfurter" | "manual"
  fetchedAt: string
}

export interface FxRatesResult {
  base: SupportedCurrency
  rates: FxRateMap
  rows: FxRateRow[]
  /** True when the live fetch failed and these are cached (possibly stale) values. */
  stale: boolean
}

const FOREIGN_CURRENCIES = CURRENCIES.map((entry) => entry.value).filter(
  (code): code is Exclude<SupportedCurrency, "ZAR"> => code !== BASE_CURRENCY,
)

interface FrankfurterResponse {
  date: string
  rates: Record<string, number>
}

/**
 * Fetches live rates from frankfurter.app (free, no API key, ECB daily).
 *
 * Returns null on any failure — network, non-200, malformed body, missing pair. Callers fall
 * back to the cache: a quote must still build when the FX provider is down.
 */
export async function fetchLiveRates(): Promise<{ asOf: string; rates: FxRateMap } | null> {
  const symbols = [BASE_CURRENCY, ...FOREIGN_CURRENCIES].filter((code) => code !== FRANKFURTER_BASE)
  const url = `${FRANKFURTER_URL}?from=${FRANKFURTER_BASE}&to=${symbols.join(",")}`

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
    if (!response.ok) return null

    const body = (await response.json()) as FrankfurterResponse
    // EUR is the request base, so it never appears in the response body; add it as unity so the
    // derivation below can treat every currency identically.
    const perEur: Record<string, number> = { ...body.rates, [FRANKFURTER_BASE]: 1 }

    const eurToBase = perEur[BASE_CURRENCY]
    if (!eurToBase || !Number.isFinite(eurToBase)) return null

    const rates: FxRateMap = { [BASE_CURRENCY]: 1 }
    for (const code of FOREIGN_CURRENCIES) {
      const eurToCode = perEur[code]
      if (!eurToCode || !Number.isFinite(eurToCode)) continue
      // 1 code = (EUR→base) / (EUR→code) base units.
      rates[code] = roundFxRate(eurToBase / eurToCode)
    }

    if (Object.keys(rates).length <= 1) return null

    return { asOf: body.date, rates }
  } catch {
    // Timeouts, DNS failures, malformed JSON. The caller degrades to cache.
    return null
  }
}

function mapRows(rows: Database["public"]["Tables"]["fx_rates"]["Row"][]): FxRateRow[] {
  return rows.map((row) => ({
    currency: row.quote_currency as SupportedCurrency,
    rate: Number(row.rate),
    asOf: row.as_of,
    source: row.source === "manual" ? "manual" : "frankfurter",
    fetchedAt: row.fetched_at,
  }))
}

function toRateMap(rows: FxRateRow[]): FxRateMap {
  const map: FxRateMap = { [BASE_CURRENCY]: 1 }
  for (const row of rows) {
    map[row.currency] = row.rate
  }
  return map
}

async function readCache(supabase: SupabaseClient<Database>): Promise<FxRateRow[]> {
  const { data, error } = await supabase
    .from("fx_rates")
    .select("base_currency, quote_currency, rate, as_of, source, fetched_at")
    .eq("base_currency", BASE_CURRENCY)

  if (error) {
    throw new Error(`Could not read exchange rates: ${error.message}`)
  }

  return mapRows(data ?? [])
}

async function writeRates(
  supabase: SupabaseClient<Database>,
  asOf: string,
  rates: FxRateMap,
  source: "frankfurter" | "manual",
): Promise<void> {
  const payload = Object.entries(rates)
    .filter(([code]) => code !== BASE_CURRENCY)
    .map(([code, rate]) => ({
      base_currency: BASE_CURRENCY,
      quote_currency: code,
      rate,
      as_of: asOf,
      source,
      fetched_at: new Date().toISOString(),
    }))

  if (payload.length === 0) return

  const { error } = await supabase
    .from("fx_rates")
    .upsert(payload, { onConflict: "base_currency,quote_currency" })

  if (error) {
    throw new Error(`Could not save exchange rates: ${error.message}`)
  }
}

function isStale(rows: FxRateRow[]): boolean {
  if (rows.length === 0) return true
  const oldest = Math.min(...rows.map((row) => new Date(row.fetchedAt).getTime()))
  return Number.isNaN(oldest) || Date.now() - oldest > CACHE_TTL_MS
}

/**
 * The rates to price a quote with: cached values, refreshed from the provider when they have
 * aged past the TTL.
 *
 * A refresh failure is never fatal — the cached rows come back with `stale: true` so the UI can
 * say so, rather than blocking the build dialog on a third-party outage.
 */
export async function getRates(
  supabase: SupabaseClient<Database>,
  options: { forceRefresh?: boolean } = {},
): Promise<FxRatesResult> {
  const cached = await readCache(supabase)

  if (!options.forceRefresh && !isStale(cached)) {
    return { base: BASE_CURRENCY, rates: toRateMap(cached), rows: cached, stale: false }
  }

  const live = await fetchLiveRates()
  if (!live) {
    return { base: BASE_CURRENCY, rates: toRateMap(cached), rows: cached, stale: true }
  }

  // A manually-entered rate is a deliberate override by a manager; a scheduled refresh must not
  // silently undo it. An explicit forceRefresh (the ↻ button) does overwrite.
  const preserved = new Set(
    options.forceRefresh ? [] : cached.filter((row) => row.source === "manual").map((r) => r.currency),
  )
  const toWrite = Object.fromEntries(
    Object.entries(live.rates).filter(([code]) => !preserved.has(code as SupportedCurrency)),
  )

  await writeRates(supabase, live.asOf, toWrite, "frankfurter")

  const refreshed = await readCache(supabase)
  return { base: BASE_CURRENCY, rates: toRateMap(refreshed), rows: refreshed, stale: false }
}

/** Reads the cache without ever calling out. Used on hot paths (quote build) where a slow
 *  third party must not add latency — the UI refreshes rates explicitly instead. */
export async function getCachedRates(supabase: SupabaseClient<Database>): Promise<FxRatesResult> {
  const cached = await readCache(supabase)
  return {
    base: BASE_CURRENCY,
    rates: toRateMap(cached),
    rows: cached,
    stale: isStale(cached),
  }
}

/** Stores a hand-entered rate. Marked `manual` so a background refresh leaves it alone. */
export async function upsertManualRate(
  supabase: SupabaseClient<Database>,
  currency: SupportedCurrency,
  rate: number,
): Promise<void> {
  await writeRates(
    supabase,
    new Date().toISOString().slice(0, 10),
    { [currency]: roundFxRate(rate) },
    "manual",
  )
}
