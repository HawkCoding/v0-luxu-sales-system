"use client"

import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { describeGroupPax, type PaxGroupProblem, type PaxGroupView } from "@/lib/packages/pax-group-toggles"
import { groupTabId, PAX_GROUP_PANEL_ID } from "@/components/packages/pax-group-editor-context"

const ALL_VALUE = "all"

interface PaxGroupBarProps {
  groups: PaxGroupView[]
  problems: ReadonlyMap<string, PaxGroupProblem | null>
  /** null = "All suites". */
  activeGroupId: string | null
  onActiveGroupChange: (groupId: string | null) => void
  onAddGroup: () => void
  /** "Suite", "Room", "Cabin". */
  noun: string
  /** Guests in the suites, and on the booking (null when the booking's totals aren't loaded). */
  placed: number
  total: number | null
  /** The live region's text: every group action is announced here. */
  announcement: string
}

/** The marker after a suite's pax text: never colour alone -- an icon plus a word or the pax text. */
function ProblemMarker({ problem }: { problem: PaxGroupProblem | null | undefined }) {
  if (!problem) return null
  return (
    <>
      <TriangleAlert
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          problem.level === "blocking" ? "text-destructive" : "text-amber-600 dark:text-amber-500",
        )}
        aria-hidden="true"
      />
      {problem.level === "warning" ? <span className="text-xs font-medium"> Check</span> : null}
      <span className="sr-only">, needs attention: {problem.reasons.join(", ")}</span>
    </>
  )
}

/**
 * Build Booking step 2's suite switcher, rendered inside the dialog's Tabs root: a tab per suite
 * plus "All suites" (a Select with previous/next on phones), "Add suite", a placed-guests summary
 * and the polite live region every group action announces through.
 */
export function PaxGroupBar({
  groups,
  problems,
  activeGroupId,
  onActiveGroupChange,
  onAddGroup,
  noun,
  placed,
  total,
  announcement,
}: PaxGroupBarProps) {
  const nounPlural = `${noun.toLowerCase()}s`
  const order: (string | null)[] = [null, ...groups.map((group) => group.id)]
  const activeIndex = Math.max(0, order.indexOf(activeGroupId))
  const mismatch = total !== null && placed !== total
  const toValue = (groupId: string | null) => groupId ?? ALL_VALUE
  const fromValue = (value: string) => (value === ALL_VALUE ? null : value)

  // A fragment, not a wrapper: the sticky tab row has to be a direct child of the Tabs root that
  // also holds the leg list, or it would only stick within its own box.
  return (
    <>
      <div className="mb-0 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">{`${noun}s`}</h3>
        <p className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
          {groups.length} {nounPlural}
          {total !== null ? (
            <>
              {" · "}
              {placed} of {total} guests placed
              {mismatch ? (
                <>
                  <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" aria-hidden="true" />
                  <span className="font-medium text-foreground"> check</span>
                </>
              ) : null}
            </>
          ) : null}
        </p>
      </div>

      {/* -top-6 + pt-8: stuck, the bar also covers DialogContent's p-6 strip, so nothing scrolls
          visibly above it. */}
      <div className="sticky -top-6 z-20 -mx-6 border-b bg-background px-6 pt-8 pb-2">
        <div className="hidden items-start gap-2 md:flex">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger
              value={ALL_VALUE}
              id={groupTabId(null)}
              aria-controls={PAX_GROUP_PANEL_ID}
              className="h-auto flex-none py-1.5"
            >
              All {nounPlural}{" "}
              <span className="text-xs font-normal text-muted-foreground">{groups.length}</span>
            </TabsTrigger>
            {groups.map((group) => {
              const problem = problems.get(group.id)
              const blocking = problem?.level === "blocking"
              return (
                <TabsTrigger
                  key={group.id}
                  value={group.id}
                  id={groupTabId(group.id)}
                  aria-controls={PAX_GROUP_PANEL_ID}
                  className="h-auto flex-none py-1.5"
                >
                  <span className="font-semibold">
                    {noun} {group.position}
                  </span>{" "}
                  <span
                    className={cn(
                      "max-w-[14rem] truncate text-xs font-normal",
                      blocking ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {group.shortLabel} · {describeGroupPax(group.pax)}
                  </span>
                  <ProblemMarker problem={problem} />
                </TabsTrigger>
              )
            })}
          </TabsList>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onAddGroup}>
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Add {noun.toLowerCase()}
          </Button>
        </div>

        <div className="space-y-2 md:hidden">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={`Previous ${noun.toLowerCase()}`}
              disabled={activeIndex === 0}
              onClick={() => onActiveGroupChange(order[activeIndex - 1] ?? null)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Select value={toValue(activeGroupId)} onValueChange={(value) => onActiveGroupChange(fromValue(value))}>
              <SelectTrigger className="min-w-0 flex-1" aria-label={`Show ${noun.toLowerCase()}`}>
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All {nounPlural}</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {noun} {group.position} · {group.shortLabel} · {describeGroupPax(group.pax)}
                    {problems.get(group.id) ? " (needs attention)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={`Next ${noun.toLowerCase()}`}
              disabled={activeIndex === order.length - 1}
              onClick={() => onActiveGroupChange(order[activeIndex + 1] ?? null)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={`Add ${noun.toLowerCase()}`}
              onClick={onAddGroup}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {activeGroupId === null ? (
        <p className="mt-2 mb-4 text-xs text-muted-foreground">
          Each {noun.toLowerCase()} starts with every service. Pick a {noun.toLowerCase()} to see only what it&apos;s on.
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}
