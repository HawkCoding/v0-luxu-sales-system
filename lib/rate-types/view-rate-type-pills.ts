import type { RateType, SupplierRateCard } from "@/lib/types"

/** Stable id used to group rate cards whose rate type cannot be resolved. */
export const UNRESOLVED_RATE_TYPE_ID = "__unresolved__"

export interface RateTypePill {
  id: string
  name: string
  sortOrder: number
}

export interface RateTypePillSelection {
  pills: RateTypePill[]
  defaultSelectedId: string | null
}

/**
 * Derive the rate-type pills for the read-only supplier pricing matrix.
 *
 * A pill is produced for every rate type that has at least one rate card —
 * including archived ones, so no published price is ever hidden. Cards whose
 * `rateTypeId` does not resolve to a known rate type are grouped under a single
 * fallback "Other" pill that always sorts last.
 *
 * Pills are ordered by the rate type `sortOrder`. The default selected id is the
 * supplier default rate type when it has cards, otherwise the first pill.
 */
export function resolveRateTypePills(
  rateCards: SupplierRateCard[],
  rateTypes: RateType[],
  defaultRateTypeId: string | null,
): RateTypePillSelection {
  const rateTypesById = new Map(rateTypes.map((rt) => [rt.id, rt]))
  const idsWithCards = new Set<string>()
  let hasUnresolved = false

  for (const card of rateCards) {
    if (card.rateTypeId && rateTypesById.has(card.rateTypeId)) {
      idsWithCards.add(card.rateTypeId)
    } else {
      hasUnresolved = true
    }
  }

  const pills: RateTypePill[] = Array.from(idsWithCards)
    .map((id) => {
      const rt = rateTypesById.get(id)
      return {
        id,
        name: rt?.name ?? id,
        sortOrder: rt?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

  if (hasUnresolved) {
    pills.push({
      id: UNRESOLVED_RATE_TYPE_ID,
      name: "Other",
      sortOrder: Number.MAX_SAFE_INTEGER,
    })
  }

  const defaultHasCards =
    defaultRateTypeId !== null && idsWithCards.has(defaultRateTypeId)
  const defaultSelectedId = defaultHasCards
    ? defaultRateTypeId
    : pills[0]?.id ?? null

  return { pills, defaultSelectedId }
}

/** True when a rate card belongs to the given pill (handles the unresolved bucket). */
export function rateCardMatchesPill(
  rateCard: SupplierRateCard,
  pillId: string,
  rateTypes: RateType[],
): boolean {
  if (pillId === UNRESOLVED_RATE_TYPE_ID) {
    return !rateCard.rateTypeId || !rateTypes.some((rt) => rt.id === rateCard.rateTypeId)
  }
  return rateCard.rateTypeId === pillId
}
