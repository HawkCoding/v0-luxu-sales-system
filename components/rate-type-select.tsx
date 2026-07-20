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

interface RateTypeSelectProps {
  /** Pre-filtered to non-archived rate types by callers. */
  rateTypes: RateType[]
  value: string | null
  onChange: (rateTypeId: string) => void
  id?: string
  className?: string
  triggerClassName?: string
  /** Pass null to render the select without a label (compact rows). */
  label?: string | null
}

export function RateTypeSelect({
  rateTypes,
  value,
  onChange,
  id,
  className,
  triggerClassName,
  label = "Rate type",
}: RateTypeSelectProps) {
  if (rateTypes.length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)}>
      {label !== null && <Label htmlFor={id}>{label}</Label>}
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className={cn("h-9", triggerClassName)}
          aria-label={label === null ? "Rate type" : undefined}
        >
          <SelectValue placeholder="System default" />
        </SelectTrigger>
        <SelectContent>
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
