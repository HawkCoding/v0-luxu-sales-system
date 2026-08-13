"use client"

import { useCallback, useEffect, useState } from "react"
import { BASE_CURRENCY } from "@/lib/money"
import { roundFxRate, type FxRateMap } from "@/lib/pricing/convert-currency"

interface FxRatesResponse {
  base: string
  rates: FxRateMap
  rows: { currency: string; rate: number; asOf: string; source: string }[]
  stale: boolean
  canEdit: boolean
  warning?: string
}

export interface UseFxRatesResult {
  rates: FxRateMap
  asOf: string | null
  /** True when the cache could not be refreshed — the rates shown may be out of date. */
  stale: boolean
  loading: boolean
  canEdit: boolean
  /** Re-fetch from the provider (the ↻ button). Resolves once the new rates are in state. */
  refresh: () => Promise<void>
  /** Override one pair locally, for this dialog only. Does NOT write to the shared cache — a
   *  salesperson nudging a rate for one quote must not repriced everyone else's. */
  setRate: (currency: string, rate: number) => void
}

/**
 * Loads the exchange-rate cache for a screen that prices in more than one currency.
 *
 * Deliberately not SWR: the rates a quote is priced at must not change underneath the user
 * mid-edit because a background revalidation fired. It loads once when `enabled` flips true, and
 * only changes again when the user asks it to.
 */
export function useFxRates(enabled: boolean): UseFxRatesResult {
  const [rates, setRates] = useState<FxRateMap>({ [BASE_CURRENCY]: 1 })
  const [asOf, setAsOf] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const load = useCallback(async (force: boolean) => {
    setLoading(true)
    try {
      const response = await fetch("/api/fx/rates", { method: force ? "POST" : "GET" })
      if (!response.ok) {
        // Leave whatever is already in state: a failed refresh must not wipe usable rates.
        setStale(true)
        return
      }
      const body = (await response.json()) as FxRatesResponse
      setRates({ ...body.rates, [BASE_CURRENCY]: 1 })
      setAsOf(body.rows[0]?.asOf ?? null)
      setStale(body.stale)
      setCanEdit(body.canEdit)
    } catch {
      setStale(true)
    } finally {
      setLoading(false)
      setLoadedOnce(true)
    }
  }, [])

  useEffect(() => {
    if (!enabled || loadedOnce) return
    void load(false)
  }, [enabled, loadedOnce, load])

  const refresh = useCallback(() => load(true), [load])

  const setRate = useCallback((currency: string, rate: number) => {
    if (!Number.isFinite(rate) || rate <= 0) return
    setRates((current) => ({ ...current, [currency.toUpperCase()]: roundFxRate(rate) }))
  }, [])

  return { rates, asOf, stale, loading, canEdit, refresh, setRate }
}
