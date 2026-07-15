"use client"

import { CalendarRange } from "lucide-react"
import type { PackageDetail } from "@/lib/types"
import type { ApplyLegState } from "@/lib/packages/apply-dialog-state"
import { deriveTripDateRangeFromStates, nightsBetween } from "@/lib/packages/trip-date-range"
import { formatJourneyRange } from "@/lib/quotes/quote-presentation"

interface TripDateSummaryProps {
  detail: PackageDetail
  states: ApplyLegState[]
}

/**
 * Live read-only trip range derived from the configured services — the salesperson never picks
 * trip dates directly; changing a service date re-dates the trip here immediately.
 */
export function TripDateSummary({ detail, states }: TripDateSummaryProps) {
  const range = deriveTripDateRangeFromStates(detail, states)
  const label = formatJourneyRange(range.start, range.end)
  const nights = nightsBetween(range.start, range.end)

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
      {label ? (
        <span>
          <span className="font-medium">Trip: {label}</span>
          {nights !== null && nights > 0 ? (
            <span className="text-muted-foreground">
              {" "}
              ({nights} night{nights === 1 ? "" : "s"})
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-muted-foreground">
          Trip dates are worked out from the service dates below
        </span>
      )}
    </div>
  )
}
