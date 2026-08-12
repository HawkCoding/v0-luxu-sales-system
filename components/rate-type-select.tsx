"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { RateType } from "@/lib/types"

/** Sentinel for the inherit option. Radix Select forbids an empty string as an item value. */
const INHERIT_VALUE = "__inherit__"

interface RateTypeSelectProps {
  /** Pre-filtered to non-archived rate types by callers. */
  rateTypes: RateType[]
  value: string | null
  onChange: (rateTypeId: string | null) => void
  id?: string
  className?: string
  triggerClassName?: string
  /** Pass null to render the select without a label (compact rows). */
  label?: string | null
  /**
   * Text for a leading "inherit" option that resolves to null. Naming what will be inherited
   * (e.g. "Supplier default (Standard Tour Operator)") lets the user see the rate without picking
   * it. Picking a rate by hand is a hard contract that fails if it has no card; inheriting falls
   * through to the supplier's base rate instead. Omit to require an explicit choice.
   */
  inheritLabel?: string
}

export function RateTypeSelect({
  rateTypes,
  value,
  onChange,
  id,
  className,
  triggerClassName,
  label = "Rate type",
  inheritLabel,
}: RateTypeSelectProps) {
  if (rateTypes.length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)}>
      {label !== null && <Label htmlFor={id}>{label}</Label>}
      <Select
        value={value ?? (inheritLabel ? INHERIT_VALUE : undefined)}
        onValueChange={(next) => onChange(next === INHERIT_VALUE ? null : next)}
      >
        <SelectTrigger
          id={id}
          className={cn("h-9", triggerClassName)}
          aria-label={label === null ? "Rate type" : undefined}
        >
          <SelectValue placeholder={inheritLabel ?? "System default"} />
        </SelectTrigger>
        <SelectContent>
          {inheritLabel ? <SelectItem value={INHERIT_VALUE}>{inheritLabel}</SelectItem> : null}
          {rateTypes.map((rt) => (
            <SelectItem key={rt.id} value={rt.id}>
              {rt.name}
              {rt.isDefault ? " (default)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
