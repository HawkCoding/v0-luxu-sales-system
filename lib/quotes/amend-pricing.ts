import { BASE_CURRENCY } from "@/lib/money"
import { roundFxRate, type FxRateMap } from "@/lib/pricing/convert-currency"
import type { PricingSnapshot, QuoteLineItem } from "@/lib/types"

/**
 * Amend defaults an accepted quote's existing lines to the price the client accepted. The accepted
 * quote's own exchange rates are rebuilt below and PREFILLED (the salesperson may still change any
 * of them); whatever still moves an existing line — an edited rate, or a supplier rate card edited
 * since acceptance — is surfaced on the confirmation by findChangedExistingLines.
 */

type SnapshotLine = { pricingSnapshot?: PricingSnapshot | null }

function normaliseCurrency(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase() || BASE_CURRENCY
}

export interface AcceptedQuoteFxRates {
  /** Base-relative rates (1 unit = N base units), the same shape the pricing engine consumes. These
   *  are defaults: merge them over the cached rates and UNDER anything the salesperson typed. Only
   *  currencies the accepted quote actually converted are present. */
  rates: FxRateMap
  /** Currencies whose default rate comes from the accepted quote rather than today's cache. */
  prefilledCurrencies: string[]
}

/**
 * The rates an amend prices at: cached, then the accepted quote's (the prefilled defaults), then
 * what the salesperson sent — so a rate they typed wins over the default. The base is pinned to 1.
 *
 * `clientRates` arrive already sanitised and rounded to 6dp (roundFxRate). A client rate that is
 * just the prefilled default sent back must not replace the unrounded accepted rate — on a non-ZAR
 * quote the rounding could move the 6th decimal of the cross rate — so it is dropped; anything the
 * salesperson actually changed differs from it and wins.
 */
export function mergeAmendFxRates(input: {
  cachedRates: FxRateMap
  accepted: FxRateMap
  clientRates: FxRateMap
}): FxRateMap {
  const typed = Object.fromEntries(
    Object.entries(input.clientRates).filter(([code, rate]) => {
      const accepted = input.accepted[code]
      return accepted === undefined || roundFxRate(accepted) !== rate
    }),
  )
  return { ...input.cachedRates, ...input.accepted, ...typed, [BASE_CURRENCY]: 1 }
}

/**
 * Rebuilds the exchange rates an accepted quote was priced at from its own line snapshots.
 *
 * Each converted line stamps `fxRate` — the multiplier from its `sourceCurrency` into the quote
 * currency (convertAmount: fromRate / toRate, rounded to 6dp) — so the snapshots carry the cross
 * rates directly. Only the ratio matters to convertAmount, so a base-relative map is rebuilt by
 * anchoring the quote currency:
 *   - quote currency is the base (ZAR): anchor 1, so map[S] = fxRate.
 *   - otherwise, a base-currency line converted into the quote currency fixes the anchor as
 *     1 / its fxRate; failing that, today's rate for the quote currency is the anchor.
 * Then map[S] = fxRate_S × anchor, which makes convertAmount(S → quote) reproduce fxRate_S exactly.
 *
 * A currency that appears only on a newly added line is absent here, so it falls back to the
 * current rate when merged.
 */
export function rebuildAcceptedQuoteFxRates(
  lines: readonly SnapshotLine[],
  quoteCurrency: string,
  currentRates: FxRateMap,
): AcceptedQuoteFxRates {
  const target = normaliseCurrency(quoteCurrency)
  const crossRates = new Map<string, number>()
  for (const line of lines) {
    const snapshot = line.pricingSnapshot
    if (!snapshot?.sourceCurrency) continue
    const source = normaliseCurrency(snapshot.sourceCurrency)
    const rate = Number(snapshot.fxRate)
    if (source === target || !Number.isFinite(rate) || rate <= 0) continue
    // Every line of one quote was priced off one rate map, so the first stamp per currency stands.
    if (!crossRates.has(source)) crossRates.set(source, rate)
  }

  const rates: FxRateMap = {}
  const prefilledCurrencies: string[] = []
  if (crossRates.size === 0) return { rates, prefilledCurrencies }

  let anchor: number | null = null
  if (target === BASE_CURRENCY) {
    anchor = 1
  } else {
    const baseCross = crossRates.get(BASE_CURRENCY)
    if (baseCross) {
      anchor = 1 / baseCross
      rates[target] = anchor
      prefilledCurrencies.push(BASE_CURRENCY)
    } else {
      const current = currentRates[target]
      anchor = current && Number.isFinite(current) && current > 0 ? current : null
    }
  }
  if (anchor === null) return { rates, prefilledCurrencies }

  for (const [source, cross] of crossRates) {
    if (source === BASE_CURRENCY) continue
    rates[source] = cross * anchor
    prefilledCurrencies.push(source)
  }

  return { rates, prefilledCurrencies: prefilledCurrencies.sort() }
}

export interface ChangedExistingLine {
  description: string
  before: number
  after: number
}

function isCommissionLine(line: QuoteLineItem): boolean {
  return line.pricingSnapshot?.commission != null || line.description.trim().toLowerCase() === "commission"
}

/**
 * A key that survives a re-price: the leg, suite and passenger kind (and transfer request) the
 * line priced, not its description, which carries dates and labels that legitimately change.
 * Lines priced without a leg (manual extras, legacy package lines) fall back to the description.
 */
export function amendLineKey(line: QuoteLineItem): string {
  const snapshot = line.pricingSnapshot
  if (snapshot?.legId) {
    return [
      `leg:${snapshot.legId}`,
      `suite:${snapshot.suiteTypeId ?? ""}`,
      `kind:${snapshot.passengerKind ?? ""}`,
      `trip:${snapshot.transportRequestId ?? ""}`,
    ].join("|")
  }
  return `desc:${line.description.trim().toLowerCase()}`
}

/**
 * Existing lines whose unit price moved in the re-price (after the FX lock, that means a supplier
 * rate card was edited since the quote was accepted). Matched by amendLineKey, pairing repeated
 * keys in order. An unmatched new line is a genuine addition and never reported; a quantity change
 * (an extra night) is the amendment itself and isn't either. The Commission line is skipped — it is
 * re-priced off the subtotal by design.
 */
export function findChangedExistingLines(
  previous: readonly QuoteLineItem[],
  next: readonly QuoteLineItem[],
): ChangedExistingLine[] {
  const previousByKey = new Map<string, QuoteLineItem[]>()
  for (const line of previous) {
    if (isCommissionLine(line)) continue
    const key = amendLineKey(line)
    const bucket = previousByKey.get(key)
    if (bucket) bucket.push(line)
    else previousByKey.set(key, [line])
  }

  const changed: ChangedExistingLine[] = []
  for (const line of next) {
    if (isCommissionLine(line)) continue
    const match = previousByKey.get(amendLineKey(line))?.shift()
    if (!match) continue
    if (Math.round(match.unitPrice * 100) !== Math.round(line.unitPrice * 100)) {
      changed.push({ description: line.description, before: match.unitPrice, after: line.unitPrice })
    }
  }
  return changed
}
