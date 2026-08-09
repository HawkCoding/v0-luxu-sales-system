"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RateType, SupplierRateAdjustment } from "@/lib/types"

const REMOVE_ICON_BUTTON_CLASS =
  "border-muted-foreground/25 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"


export interface ApplicableRatesCardProps {
  isEditing: boolean
  rateTypes: RateType[]
  defaultRateTypeId: string | null
  adjustments: SupplierRateAdjustment[]
  onChange: (next: SupplierRateAdjustment[]) => void
  /**
   * Set this supplier's own default rate. Omit to render the default as read-only (used where the
   * supplier has no baseline to choose, e.g. manual-pricing suppliers).
   */
  onChangeDefaultRateType?: (rateTypeId: string) => void
}

export function ApplicableRatesCard({
  isEditing,
  rateTypes,
  defaultRateTypeId,
  adjustments,
  onChange,
  onChangeDefaultRateType,
}: ApplicableRatesCardProps) {
  const [pendingDefaultRateTypeId, setPendingDefaultRateTypeId] = useState<string | null>(null)
  const activeRateTypes = rateTypes.filter((rt) => !rt.archivedAt)
  const rateTypeById = new Map(activeRateTypes.map((rt) => [rt.id, rt]))
  const defaultRateType =
    (defaultRateTypeId ? rateTypeById.get(defaultRateTypeId) : undefined) ??
    activeRateTypes.find((rt) => rt.isDefault) ??
    activeRateTypes[0] ??
    null

  // Only show adjustments for rates that still exist and are not the default.
  const applied = adjustments.filter(
    (adjustment) =>
      adjustment.rateTypeId !== defaultRateType?.id && rateTypeById.has(adjustment.rateTypeId),
  )
  const appliedIds = new Set(applied.map((adjustment) => adjustment.rateTypeId))
  const availableToAdd = activeRateTypes.filter(
    (rt) => rt.id !== defaultRateType?.id && !appliedIds.has(rt.id),
  )

  const addRate = (rateTypeId: string) => {
    if (appliedIds.has(rateTypeId)) return
    onChange([...adjustments, { rateTypeId, discountPct: 0 }])
  }

  const updateDiscount = (rateTypeId: string, discountPct: number) => {
    onChange(
      adjustments.map((adjustment) =>
        adjustment.rateTypeId === rateTypeId ? { ...adjustment, discountPct } : adjustment,
      ),
    )
  }

  const removeRate = (rateTypeId: string) => {
    onChange(adjustments.filter((adjustment) => adjustment.rateTypeId !== rateTypeId))
  }

  const defaultLabel = defaultRateType?.name ?? "default rate"
  const canEditDefault = isEditing && Boolean(onChangeDefaultRateType) && activeRateTypes.length > 0
  const pendingDefaultLabel = pendingDefaultRateTypeId
    ? rateTypeById.get(pendingDefaultRateTypeId)?.name ?? "the selected rate"
    : null

  // Changing the baseline resets every percentage, so it always goes through a confirm -- unless
  // there is nothing to lose yet.
  const requestDefaultChange = (rateTypeId: string) => {
    if (rateTypeId === defaultRateType?.id) return
    if (applied.length === 0) {
      onChangeDefaultRateType?.(rateTypeId)
      return
    }
    setPendingDefaultRateTypeId(rateTypeId)
  }

  const confirmDefaultChange = () => {
    if (pendingDefaultRateTypeId) {
      onChangeDefaultRateType?.(pendingDefaultRateTypeId)
    }
    setPendingDefaultRateTypeId(null)
  }

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      <div>
        <p className="text-sm font-semibold text-foreground">Applicable Rates</p>
        <p className="text-xs text-muted-foreground">
          {defaultRateType ? (
            <>
              <span className="font-medium text-foreground">{defaultLabel}</span> is the default and
              starting point. Add other rates that apply to this supplier and how much cheaper they
              are than {defaultLabel}.
            </>
          ) : (
            "Configure rate types in Settings before adding applicable rates."
          )}
        </p>
      </div>

      {canEditDefault ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="supplier-default-rate" className="text-xs font-medium">
            Default rate
          </Label>
          <Select value={defaultRateType?.id ?? ""} onValueChange={requestDefaultChange}>
            <SelectTrigger id="supplier-default-rate" className="w-56">
              <SelectValue placeholder="Select the default rate" />
            </SelectTrigger>
            <SelectContent>
              {activeRateTypes.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>
                  {rt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Baseline · 0% markdown</span>
        </div>
      ) : defaultRateType ? (
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{defaultLabel}</Badge>
          <span className="text-xs text-muted-foreground">Default · baseline (0% markdown)</span>
        </div>
      ) : null}

      {applied.length > 0 ? (
        <div className="space-y-2">
          {applied.map((adjustment) => {
            const rateType = rateTypeById.get(adjustment.rateTypeId)
            return (
              <div
                key={adjustment.rateTypeId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{rateType?.name ?? "Unknown rate"}</Badge>
                  {!isEditing ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {adjustment.discountPct.toFixed(2)}% off {defaultLabel}
                    </span>
                  ) : null}
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <NumericInput
                        min="0"
                        max="100"
                        step="0.01"
                        value={adjustment.discountPct}
                        onValueChange={(value) =>
                          updateDiscount(adjustment.rateTypeId, value ?? 0)
                        }
                        className="w-24"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        % off {defaultLabel}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={REMOVE_ICON_BUTTON_CLASS}
                      aria-label={`Remove ${rateType?.name ?? "rate"}`}
                      onClick={() => removeRate(adjustment.rateTypeId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No additional rates apply to this supplier.</p>
      )}

      {isEditing ? (
        <div className="flex items-center gap-2">
          <Label className="sr-only">Add a rate</Label>
          <Select
            value=""
            onValueChange={(value) => {
              addRate(value)
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Add a rate…" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>
                  {rt.name}
                </SelectItem>
              ))}

            </SelectContent>
          </Select>
          <Button asChild type="button" size="sm" variant="ghost" className="h-9 text-xs">
            <Link href="/app/settings/rate-types">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Create new rate
            </Link>
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={pendingDefaultRateTypeId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDefaultRateTypeId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the default rate to {pendingDefaultLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every percentage on this supplier resets to 0% — they were measured against{" "}
              {defaultLabel}, and there is no safe way to re-express them against{" "}
              {pendingDefaultLabel}. {defaultLabel} stays listed so its existing rate cards keep
              their tab; re-enter each percentage afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDefaultChange}>
              Change default and reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
