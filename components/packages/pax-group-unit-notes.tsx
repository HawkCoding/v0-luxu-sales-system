"use client"

import { Info, Link2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { PassengerTotals } from "@/lib/packages/passenger-totals"
import {
  describeGroupList,
  describeGroupPax,
  isGroupListPlural,
  type PaxGroupView,
} from "@/lib/packages/pax-group-toggles"

/** The summed primary headcount of the given groups. */
export function sumGroupPax(groups: readonly PaxGroupView[], ids: readonly string[]): PassengerTotals {
  return groups
    .filter((group) => ids.includes(group.id))
    .reduce(
      (total, group) => ({
        adultCount: total.adultCount + group.pax.adultCount,
        childCount: total.childCount + group.pax.childCount,
        infantCount: total.infantCount + group.pax.infantCount,
      }),
      { adultCount: 0, childCount: 0, infantCount: 0 },
    )
}

function samePax(a: PassengerTotals, b: PassengerTotals): boolean {
  return a.adultCount === b.adultCount && a.childCount === b.childCount && a.infantCount === b.infantCount
}

interface GroupPaxHintProps {
  /** The unit's or trip's explicit groups; [] renders nothing (shared units keep manual counts). */
  ids: readonly string[]
  /** Its current counts. */
  pax: PassengerTotals
  groups: readonly PaxGroupView[]
  /** "Suite", "Room", "Cabin". */
  noun: string
  /** "room", "transfer". */
  itemNoun: string
  onMatch: () => void
}

/**
 * Under the counts of a unit or trip with explicit groups: "Guests follow Suites 2 & 3 (2 adults,
 * 2 children). Edit to override." -- or, once the counts were edited away from that sum, an amber
 * note with "Match suites". Never blocks.
 */
export function GroupPaxHint({ ids, pax, groups, noun, itemNoun, onMatch }: GroupPaxHintProps) {
  if (ids.length === 0) return null
  const expected = sumGroupPax(groups, ids)
  const list = describeGroupList(ids, groups, noun)
  if (samePax(expected, pax)) {
    return (
      <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
        Guests follow {list} ({describeGroupPax(expected)}). Edit to override.
      </p>
    )
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-700 dark:text-amber-400 md:col-span-2 xl:col-span-3">
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {list} {isGroupListPlural(ids, groups) ? "have" : "has"} {describeGroupPax(expected)}; this {itemNoun} holds{" "}
        {describeGroupPax(pax)}.
      </span>
      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onMatch}>
        Match {noun.toLowerCase()}s
      </Button>
    </p>
  )
}

/** "Shared with Suite 3 — changes apply to both.", in the per-suite view only. */
export function GroupSharedNote({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p className="flex gap-1.5 text-xs text-muted-foreground md:col-span-2 xl:col-span-3">
      <Link2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  )
}

interface LegGroupHelperProps {
  legName: string
  supplierName: string
  isHotel: boolean
  noun: string
  position: number
}

/** The leg-level note in the per-suite view: leg fields are the whole leg's. How a suite gets its
 *  own (the supplier again as a separate leg) sits in a tooltip, so the line stays short. */
export function LegGroupHelper({ supplierName, isHotel, noun, position }: LegGroupHelperProps) {
  const fields = isHotel ? "Meal plan, nights, dates and rate" : "Dates and rate"
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>
        {fields} are shared by every {noun.toLowerCase()} on this service.
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`How to give ${noun} ${position} different ones`}
            className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          For different ones, add {supplierName} again in step 1 and keep only {noun} {position} on it.
        </TooltipContent>
      </Tooltip>
    </p>
  )
}
