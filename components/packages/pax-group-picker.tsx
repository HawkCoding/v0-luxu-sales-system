"use client"

import { useId } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { describeGroupList, type PaxGroupView } from "@/lib/packages/pax-group-toggles"

interface PaxGroupPickerProps {
  groups: PaxGroupView[]
  /** The unit's or trip's paxGroupIds: [] = every group. */
  value: readonly string[]
  onChange: (ids: string[]) => void
  /** The suite in view; picking "Only these suites" starts from it (every suite in All suites). */
  activeGroupId: string | null
  /** "Suite", "Room", "Cabin". */
  noun: string
  /** What the unit or trip is called: "room", "transfer". */
  itemNoun: string
  /** Its 1-based number on the leg. */
  itemNumber: number
  legName: string
}

/**
 * The "For" control on a non-primary unit or a transport trip: which suites it serves. A form value
 * with helper text and a disabled-with-reason box, so a Popover with a radio group and checkboxes
 * rather than a menu. Every change applies at once; Esc or clicking outside closes it.
 */
export function PaxGroupPicker({
  groups,
  value,
  onChange,
  activeGroupId,
  noun,
  itemNoun,
  itemNumber,
  legName,
}: PaxGroupPickerProps) {
  const id = useId()
  const listText = describeGroupList(value, groups, noun)
  const mode = value.length === 0 ? "all" : "some"
  const nounPlural = `${noun.toLowerCase()}s`
  const legend =
    itemNoun === "transfer" || itemNoun === "vehicle"
      ? `Who is on ${itemNoun} ${itemNumber}?`
      : `Who is in ${itemNoun} ${itemNumber}?`
  const hintId = `${id}-last`
  const allHintId = `${id}-all-hint`

  function setMode(next: string) {
    if (next === "all") {
      onChange([])
      return
    }
    if (value.length > 0) return
    onChange(activeGroupId ? [activeGroupId] : groups.map((group) => group.id))
  }

  function toggle(groupId: string, checked: boolean) {
    const current = new Set(value)
    if (checked) current.add(groupId)
    else current.delete(groupId)
    const next = groups.map((group) => group.id).filter((candidate) => current.has(candidate))
    if (next.length === 0) return
    onChange(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 max-w-full justify-between gap-2 font-normal"
          aria-label={`Choose ${nounPlural} for ${itemNoun} ${itemNumber} on ${legName}, now ${listText}`}
        >
          <span className="truncate">
            <span className="text-muted-foreground">For:</span> {listText}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{legend}</legend>
          <RadioGroup value={mode} onValueChange={setMode} className="gap-2">
            <div className="flex items-start gap-2">
              <RadioGroupItem id={`${id}-all`} value="all" aria-describedby={allHintId} className="mt-0.5" />
              <div className="grid gap-0.5">
                <Label htmlFor={`${id}-all`} className="font-normal">
                  All {nounPlural}
                </Label>
                <p id={allHintId} className="text-xs text-muted-foreground">
                  Includes {nounPlural} added later.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem id={`${id}-some`} value="some" className="mt-0.5" />
              <Label htmlFor={`${id}-some`} className="font-normal">
                Only these {nounPlural}
              </Label>
            </div>
          </RadioGroup>
          <div className="space-y-1.5 pl-6">
            {groups.map((group) => {
              const checked = mode === "some" && value.includes(group.id)
              const last = checked && value.length === 1
              return (
                <label
                  key={group.id}
                  className="flex items-center gap-2 text-sm has-[button:disabled]:text-muted-foreground"
                >
                  <Checkbox
                    checked={checked}
                    disabled={mode === "all" || last}
                    aria-describedby={last ? hintId : undefined}
                    onCheckedChange={(next) => toggle(group.id, next === true)}
                  />
                  <span className="min-w-0 truncate">
                    {noun} {group.position} · {group.shortLabel}
                  </span>
                </label>
              )
            })}
          </div>
          <p id={hintId} className="text-xs text-muted-foreground">
            Keep at least one {noun.toLowerCase()} ticked, or delete this {itemNoun}.
          </p>
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}
