"use client"

import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { PackageLeg } from "@/lib/types"
import { SUPPLIER_KIND_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { ApplyLegState } from "@/lib/packages/apply-dialog-state"
import {
  describeGroupPax,
  describeOverviewCell,
  legName,
  type PaxGroupProblem,
  type PaxGroupView,
} from "@/lib/packages/pax-group-toggles"

interface PaxGroupOverviewProps {
  /** Every leg, in itinerary order. */
  legs: PackageLeg[]
  legStates: ApplyLegState[]
  groups: PaxGroupView[]
  problems: ReadonlyMap<string, PaxGroupProblem | null>
  primaryLegId: string | null
  /** "Suite", "Room", "Cabin". */
  noun: string
  onSelectGroup: (groupId: string) => void
  /** Tick (include) or untick a suite on a leg. */
  onToggle: (legId: string, groupId: string, include: boolean) => void
}

const STICKY_CELL =
  "sticky left-0 z-10 min-w-[6.5rem] max-w-[7.5rem] whitespace-normal border-r bg-background px-3 py-2 text-left align-top sm:min-w-[11rem] sm:max-w-[14rem]"

/** Every suite column: narrow enough that six fit the desktop dialog beside the service column. */
const SUITE_CELL = "min-w-[7.5rem] px-3 py-2 align-top sm:min-w-[8.5rem]"

/**
 * The "All suites" overview: services as rows, suites as columns, a labelled include checkbox per
 * cell. Scrolls sideways at any width with the service column pinned -- no card layout on phones,
 * and no money (totals live in step 3).
 */
export function PaxGroupOverview({
  legs,
  legStates,
  groups,
  problems,
  primaryLegId,
  noun,
  onSelectGroup,
  onToggle,
}: PaxGroupOverviewProps) {
  const stateByLegId = new Map(legStates.map((state) => [state.legId, state]))
  const rows = legs.flatMap((leg) => {
    const state = stateByLegId.get(leg.id)
    return state ? [{ leg, state }] : []
  })
  const caption = `Which ${noun.toLowerCase()} is on which service. Untick a box to take a ${noun.toLowerCase()} off a service.`

  return (
    <div>
      {/* Outside the scroller so it never scrolls away or clips on a phone; the table keeps an
          sr-only caption of its own. */}
      <p id="pax-overview-caption" className="mb-2 text-xs text-muted-foreground" aria-hidden="true">
        {caption}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className={cn(STICKY_CELL, "text-xs font-medium text-muted-foreground")}>
                Service
              </th>
              {groups.map((group) => {
                const problem = problems.get(group.id)
                return (
                  <th key={group.id} scope="col" className={cn(SUITE_CELL, "text-left font-normal")}>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 font-semibold"
                      onClick={() => onSelectGroup(group.id)}
                    >
                      {noun} {group.position}
                    </Button>
                    <div className="text-xs text-muted-foreground">{group.shortLabel}</div>
                    <div
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        problem?.level === "blocking" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {problem ? (
                        <TriangleAlert
                          className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            problem.level === "blocking" ? "text-destructive" : "text-amber-600 dark:text-amber-500",
                          )}
                          aria-hidden="true"
                        />
                      ) : null}
                      <span>{describeGroupPax(group.pax)}</span>
                      {problem?.level === "warning" ? <span className="font-medium text-foreground">Check</span> : null}
                      {problem ? <span className="sr-only">, needs attention: {problem.reasons.join(", ")}</span> : null}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ leg, state }) => {
              const isPrimary = leg.id === primaryLegId
              const name = legName(leg)
              const kind = SUPPLIER_KIND_LABELS[leg.supplierKind]
              return (
                <tr key={leg.id} className="border-b last:border-0">
                  <th scope="row" className={cn(STICKY_CELL, "font-medium")}>
                    <div>{name}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {isPrimary ? `${kind} · main product` : state.selected ? kind : "Not in quote"}
                    </div>
                  </th>
                  {groups.map((group) => {
                    const cell = describeOverviewCell(state, leg, group.id, groups, primaryLegId, noun)
                    const baseId = `overview-${leg.id}-${group.id}`
                    if (cell.kind === "primary") {
                      return (
                        <td key={group.id} className={cn(SUITE_CELL, "text-xs")}>
                          {cell.line1}
                        </td>
                      )
                    }
                    const describedBy = [
                      `${baseId}-line1`,
                      cell.line2 ? `${baseId}-line2` : null,
                      cell.disabledReason ? `${baseId}-reason` : null,
                    ]
                      .filter(Boolean)
                      .join(" ")
                    return (
                      <td key={group.id} className={cn(SUITE_CELL, "text-xs")}>
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id={baseId}
                            className="mt-px"
                            checked={cell.checked}
                            disabled={cell.disabledReason !== null}
                            aria-label={`${noun} ${group.position} on ${name}`}
                            aria-describedby={describedBy}
                            onCheckedChange={(checked) => onToggle(leg.id, group.id, checked === true)}
                          />
                          <div className="min-w-0">
                            <div
                              id={`${baseId}-line1`}
                              className={cell.checked ? "text-foreground" : "text-muted-foreground"}
                            >
                              {cell.line1}
                            </div>
                            {cell.line2 ? (
                              <div id={`${baseId}-line2`} className="text-muted-foreground">
                                {cell.line2}
                              </div>
                            ) : null}
                            {cell.lastOnLeg ? (
                              <div className="text-[11px] text-muted-foreground" aria-hidden="true">
                                Only {noun.toLowerCase()} on it
                              </div>
                            ) : null}
                            {cell.disabledReason ? (
                              <span id={`${baseId}-reason`} className="sr-only">
                                {cell.disabledReason}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={cn("mt-1 text-xs text-muted-foreground", groups.length > 6 ? null : "md:hidden")}>
        Swipe sideways to see every {noun.toLowerCase()}.
      </p>
    </div>
  )
}
