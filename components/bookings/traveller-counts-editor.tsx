"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { Plus, X } from "lucide-react"
import { classifyAge, formatBucketRange, type AgeBuckets } from "@/lib/pricing/age-buckets"
import { projectPassengerTotals } from "@/lib/packages/passenger-totals"

export interface TravellerCounts {
  noOfAdults: number
  noOfChildren: number
  childAges: number[]
}

interface TravellerCountsEditorProps {
  value: TravellerCounts
  onChange: (next: TravellerCounts) => void
  /** Renders the live "this booking prices as N adults, N children, N infants" footer, using the
   * same rule pricing uses (lib/packages/passenger-totals.ts) so it can never drift from it. */
  buckets?: AgeBuckets | null
  disabled?: boolean
}

const DEFAULT_CHILD_AGE = 6

/**
 * Adults plus a per-child age roster — the age roster is what age-bucket pricing derives
 * infants and child-vs-adult promotion from (see lib/packages/passenger-totals.ts), so it's the
 * only way to reach every (adults, children, infants) combination rather than just the adult one.
 * Legacy bookings with a bare "N children" count and no ages keep that shape until "Add ages" is
 * used to convert — this never silently invents ages.
 */
export function TravellerCountsEditor({ value, onChange, buckets, disabled = false }: TravellerCountsEditorProps) {
  const hasAges = value.childAges.length > 0

  function setAdults(next: number | null) {
    onChange({ ...value, noOfAdults: next ?? 0 })
  }

  function setNoOfChildren(next: number | null) {
    onChange({ ...value, noOfChildren: next ?? 0 })
  }

  function addAgesFromCount() {
    const count = Math.max(1, value.noOfChildren)
    onChange({ ...value, noOfChildren: count, childAges: Array.from({ length: count }, () => DEFAULT_CHILD_AGE) })
  }

  function addChild() {
    const childAges = [...value.childAges, DEFAULT_CHILD_AGE]
    onChange({ ...value, childAges, noOfChildren: childAges.length })
  }

  function setAge(index: number, age: number | null) {
    const childAges = value.childAges.map((existing, i) => (i === index ? (age ?? 0) : existing))
    onChange({ ...value, childAges })
  }

  function removeAge(index: number) {
    const childAges = value.childAges.filter((_, i) => i !== index)
    onChange({ ...value, childAges, noOfChildren: childAges.length })
  }

  const preview = buckets
    ? projectPassengerTotals(
        { noOfAdults: value.noOfAdults, noOfChildren: value.noOfChildren, childAges: value.childAges },
        buckets,
      )
    : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="tce-adults" className="text-xs text-muted-foreground">
            Adults
          </Label>
          <NumericInput
            id="tce-adults"
            min="0"
            step="1"
            className="h-9 w-20"
            value={value.noOfAdults}
            onValueChange={setAdults}
            disabled={disabled}
          />
        </div>
        {!hasAges && (
          <div className="space-y-1.5">
            <Label htmlFor="tce-children" className="text-xs text-muted-foreground">
              Children
            </Label>
            <NumericInput
              id="tce-children"
              min="0"
              step="1"
              className="h-9 w-20"
              value={value.noOfChildren}
              onValueChange={setNoOfChildren}
              disabled={disabled}
            />
          </div>
        )}
        {!hasAges && value.noOfChildren > 0 && (
          <Button type="button" size="sm" variant="outline" onClick={addAgesFromCount} disabled={disabled}>
            Add ages
          </Button>
        )}
        {hasAges && (
          <Button type="button" size="sm" variant="outline" onClick={addChild} disabled={disabled}>
            <Plus className="mr-1 h-3 w-3" />
            Add child
          </Button>
        )}
      </div>

      {hasAges && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Child ages</Label>
          <div className="flex flex-wrap gap-2">
            {value.childAges.map((age, index) => (
              <div key={index} className="flex items-center gap-1.5 rounded-md border p-1.5">
                <NumericInput
                  aria-label={`Child ${index + 1} age`}
                  min="0"
                  max="30"
                  step="1"
                  className="h-8 w-16 text-center"
                  value={age}
                  onValueChange={(next) => setAge(index, next)}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground">
                  {buckets ? classifyAge(age, buckets) : ""}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label={`Remove child ${index + 1}`}
                  onClick={() => removeAge(index)}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          {buckets && (
            <p className="text-xs text-muted-foreground">
              {`Infant ${formatBucketRange(buckets).infant} · Child ${formatBucketRange(buckets).child} · Adult ${formatBucketRange(buckets).adult}`}
            </p>
          )}
        </div>
      )}

      {preview && (
        <p className="text-xs text-muted-foreground">
          This booking prices as {preview.adultCount} adult{preview.adultCount === 1 ? "" : "s"},{" "}
          {preview.childCount} child{preview.childCount === 1 ? "" : "ren"}, {preview.infantCount} infant
          {preview.infantCount === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  )
}
