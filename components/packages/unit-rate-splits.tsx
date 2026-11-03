"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { RateTypeSelect } from "@/components/rate-type-select"
import type { RateType, UnitRateSplit } from "@/lib/types"
import type { SuiteUnitState } from "@/lib/packages/apply-dialog-state"
import { guestRatesOf, rateSplitsFromGuestRates, type GuestRate } from "@/lib/packages/pax-groups"

interface RatePerGuestSwitchProps {
  unitId: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** "suite", "cabin", "tour". */
  unitNoun: string
  /** The unit's own rate, named: "SA Resident". */
  rateName: string
}

/** "Same rate / Rate per guest" under a unit's rate select. Off clears the unit's rate splits. */
export function RatePerGuestSwitch({ unitId, checked, onCheckedChange, unitNoun, rateName }: RatePerGuestSwitchProps) {
  const switchId = `rate-per-guest-${unitId}`
  const helperId = `${switchId}-help`
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Switch id={switchId} checked={checked} onCheckedChange={onCheckedChange} aria-describedby={helperId} />
        <Label htmlFor={switchId} className="text-sm font-normal">
          Rate per guest
        </Label>
      </div>
      <p id={helperId} className="text-xs text-muted-foreground">
        {checked
          ? `Pick a rate for each guest below. Guests left on the ${unitNoun} rate pay ${rateName}.`
          : `Everyone in this ${unitNoun} pays ${rateName}.`}
      </p>
    </div>
  )
}

interface RatePerGuestRowsProps {
  unit: SuiteUnitState
  rateTypes: RateType[]
  allowedRateTypeIds: string[] | null
  /** The rate the unit itself prices at; a guest picked onto it stays on the unit's rate. */
  unitRateTypeId: string | null
  /** That rate, named: "SA Resident". */
  rateName: string
  /** "suite", "cabin", "tour". */
  unitNoun: string
  onChange: (rateSplits: UnitRateSplit[]) => void
  /** The amber "no rate card" sentence for a guest's rate, or null when it has one. */
  noCardWarning: (rateTypeId: string) => string | null
  /**
   * The formatted rate-card fare one guest pays at a rate (null = the unit's own rate), as the
   * card's footer resolves it; null when there is no card to show.
   */
  rateCardPrice?: (rateTypeId: string | null, kind: GuestRate["kind"]) => string | null
}

const KIND_LABEL: Record<GuestRate["kind"], string> = { adult: "Adult", child: "Child", infant: "Infant" }

function externalKeyOf(unit: SuiteUnitState): string {
  return JSON.stringify([unit.adultCount, unit.childCount, unit.infantCount, unit.rateSplits])
}

/**
 * One rate select per guest ("Adult 1", "Adult 2", "Child 1"…), collapsed into the unit's rate
 * splits on every change. The row order is local: picking a rate never makes a row jump. It is
 * re-seeded from the unit only when its counts or splits change from outside (Duplicate, Match
 * suites, a count edit).
 */
export function RatePerGuestRows({
  unit,
  rateTypes,
  allowedRateTypeIds,
  unitRateTypeId,
  rateName,
  unitNoun,
  onChange,
  noCardWarning,
  rateCardPrice,
}: RatePerGuestRowsProps) {
  const externalKey = externalKeyOf(unit)
  const [local, setLocal] = useState(() => ({ key: externalKey, rows: guestRatesOf(unit) }))
  let rows = local.rows
  if (local.key !== externalKey) {
    // Our own change round-trips as the same splits: keep the rows where they are. Anything else
    // came from outside, so start again from the unit.
    const sameSplits =
      rows.length === unit.adultCount + unit.childCount + unit.infantCount &&
      JSON.stringify(rateSplitsFromGuestRates(rows, unitRateTypeId)) === JSON.stringify(unit.rateSplits)
    rows = sameSplits ? rows : guestRatesOf(unit)
    setLocal({ key: externalKey, rows })
  }

  function pick(index: number, rateTypeId: string | null) {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, rateTypeId: rateTypeId === unitRateTypeId ? null : rateTypeId } : row,
    )
    const splits = rateSplitsFromGuestRates(nextRows, unitRateTypeId)
    setLocal({
      key: externalKeyOf({ ...unit, rateSplits: splits }),
      rows: nextRows,
    })
    onChange(splits)
  }

  const unitShortLabel = rateTypes.find((rateType) => rateType.id === unitRateTypeId)?.shortLabel
  const ordinals = new Map<GuestRate["kind"], number>()
  return (
    <fieldset className="rounded-md border p-3 md:col-span-2 xl:col-span-3">
      <legend className="px-1 text-xs font-medium">Rate per guest</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row, index) => {
          const ordinal = (ordinals.get(row.kind) ?? 0) + 1
          ordinals.set(row.kind, ordinal)
          const warning = row.rateTypeId ? noCardWarning(row.rateTypeId) : null
          const price = warning ? null : rateCardPrice?.(row.rateTypeId, row.kind) ?? null
          const selectId = `guest-rate-${unit.id}-${row.kind}-${ordinal}`
          return (
            <div key={`${row.kind}-${ordinal}`} className="min-w-0 space-y-1">
              <RateTypeSelect
                rateTypes={rateTypes}
                allowedRateTypeIds={allowedRateTypeIds}
                value={row.rateTypeId}
                onChange={(rateTypeId) => pick(index, rateTypeId)}
                id={selectId}
                label={`${KIND_LABEL[row.kind]} ${ordinal}`}
                triggerClassName="w-full"
                inheritLabel={`${unitNoun.charAt(0).toUpperCase()}${unitNoun.slice(1)} rate (${rateName})${unitShortLabel ? ` · prints (${unitShortLabel})` : ""}`}
                // The inherit option already is the unit's rate; listing it again reads as a choice.
                excludeRateTypeIds={unitRateTypeId ? [unitRateTypeId] : []}
                showShortLabel
              />
              {price ? <p className="text-xs text-muted-foreground">Rate card {price}</p> : null}
              {warning ? <p className="text-xs text-amber-600 dark:text-amber-500">{warning}</p> : null}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
