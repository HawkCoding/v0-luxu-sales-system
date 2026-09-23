"use client"

import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface ReportingAccessSwitchProps {
  /** Stable DOM id for the switch; the visible label points at it. */
  id: string
  /** Display name used in the accessible label ("Reporting access for …"). */
  userName: string
  checked: boolean
  saving: boolean
  disabled?: boolean
  onCheckedChange: (next: boolean) => void
  className?: string
}

/**
 * Inline per-user Reporting toggle for the Settings -> Users list. The
 * spinner sits in a fixed-width slot so the row does not shift while saving,
 * and the switch is disabled until the save settles.
 */
export function ReportingAccessSwitch({
  id,
  userName,
  checked,
  saving,
  disabled = false,
  onCheckedChange,
  className,
}: ReportingAccessSwitchProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="flex size-4 items-center justify-center" aria-live="polite">
        {saving && (
          <Spinner className="size-3.5 text-muted-foreground" aria-label={`Saving reporting access for ${userName}`} />
        )}
      </span>
      <Label
        htmlFor={id}
        className={cn(
          "cursor-pointer text-xs font-medium text-muted-foreground",
          (saving || disabled) && "cursor-not-allowed",
        )}
      >
        Reporting
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={saving || disabled}
        aria-label={`Reporting access for ${userName}`}
        aria-busy={saving}
      />
    </div>
  )
}
