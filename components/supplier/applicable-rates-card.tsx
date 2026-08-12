"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, Star, Trash2 } from "lucide-react"
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
import { cn } from "@/lib/utils"
import type { RateType, SupplierRateAdjustment } from "@/lib/types"

const REMOVE_ICON_BUTTON_CLASS =
  "border-muted-foreground/25 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"


export interface ApplicableRatesCardProps {
  isEditing: boolean
  rateTypes: RateType[]
  /** This supplier's own starting price -- every percentage below is measured off it. */
  baseRateTypeId: string | null
  /** The rate quotes use. Null means "quote at the base rate". */
  quoteRateTypeId: string | null
  adjustments: SupplierRateAdjustment[]
  onChange: (next: SupplierRateAdjustment[]) => void
  /**
   * Set this supplier's base rate. Omit to render it read-only (used where the supplier has no
   * baseline to choose, e.g. manual-pricing suppliers).
   */
  onChangeBaseRateType?: (rateTypeId: string) => void
  /** Star a rate as the one quotes use. Passing the base rate's id clears the nomination. */
  onChangeQuoteRateType?: (rateTypeId: string) => void
}

export function ApplicableRatesCard({
  isEditing,
  rateTypes,
  baseRateTypeId,
  quoteRateTypeId,
  adjustments,
  onChange,
  onChangeBaseRateType,
  onChangeQuoteRateType,
}: ApplicableRatesCardProps) {
  const [pendingBaseRateTypeId, setPendingBaseRateTypeId] = useState<string | null>(null)
  const activeRateTypes = rateTypes.filter((rt) => !rt.archivedAt)
  const rateTypeById = new Map(activeRateTypes.map((rt) => [rt.id, rt]))
  const baseRateType =
    (baseRateTypeId ? rateTypeById.get(baseRateTypeId) : undefined) ??
    activeRateTypes.find((rt) => rt.isDefault) ??
    activeRateTypes[0] ??
    null

  // Only show adjustments for rates that still exist and are not the base rate.
  const applied = adjustments.filter(
    (adjustment) =>
      adjustment.rateTypeId !== baseRateType?.id && rateTypeById.has(adjustment.rateTypeId),
  )
  const appliedIds = new Set(applied.map((adjustment) => adjustment.rateTypeId))
  const availableToAdd = activeRateTypes.filter(
    (rt) => rt.id !== baseRateType?.id && !appliedIds.has(rt.id),
  )

  // A nomination that no longer names a listed rate (archived, or its adjustment was removed)
  // falls back to the base rate, matching how the server resolves it.
  const quotedRateTypeId =
    quoteRateTypeId && appliedIds.has(quoteRateTypeId) ? quoteRateTypeId : baseRateType?.id ?? null

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
    // Removing the starred rate hands the star back to the base rate -- nothing else is a safe
    // guess, and leaving it pointed at a rate this supplier no longer prices would be worse.
    if (rateTypeId === quotedRateTypeId && baseRateType) {
      onChangeQuoteRateType?.(baseRateType.id)
    }
    onChange(adjustments.filter((adjustment) => adjustment.rateTypeId !== rateTypeId))
  }

  const baseLabel = baseRateType?.name ?? "base rate"
  const canEditBase = isEditing && Boolean(onChangeBaseRateType) && activeRateTypes.length > 0
  const canStar = isEditing && Boolean(onChangeQuoteRateType)
  const pendingBaseLabel = pendingBaseRateTypeId
    ? rateTypeById.get(pendingBaseRateTypeId)?.name ?? "the selected rate"
    : null

  // Changing the base rate resets every percentage, so it always goes through a confirm -- unless
  // there is nothing to lose yet.
  const requestBaseChange = (rateTypeId: string) => {
    if (rateTypeId === baseRateType?.id) return
    if (applied.length === 0) {
      onChangeBaseRateType?.(rateTypeId)
      return
    }
    setPendingBaseRateTypeId(rateTypeId)
  }

  const confirmBaseChange = () => {
    if (pendingBaseRateTypeId) {
      onChangeBaseRateType?.(pendingBaseRateTypeId)
    }
    setPendingBaseRateTypeId(null)
  }

  function StarControl({ rateTypeId, name }: { rateTypeId: string; name: string }) {
    const starred = rateTypeId === quotedRateTypeId
    if (!canStar) {
      return (
        <Star
          aria-hidden
          className={cn("h-4 w-4 shrink-0", starred ? "fill-current text-foreground" : "text-transparent")}
        />
      )
    }
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-pressed={starred}
        aria-label={`Use ${name} for quotes`}
        title={starred ? `${name} is used on quotes` : `Use ${name} for quotes`}
        onClick={() => onChangeQuoteRateType?.(rateTypeId)}
      >
        <Star
          className={cn("h-4 w-4", starred ? "fill-current text-foreground" : "text-muted-foreground")}
        />
      </Button>
    )
  }

  const quotedBadge = <Badge variant="secondary">Used on quotes</Badge>

  return (
    <div className="rounded-lg border p-4 space-y-3 bg-card">
      <div>
        <p className="text-sm font-semibold text-foreground">Applicable Rates</p>
        <p className="text-xs text-muted-foreground">
          {baseRateType ? (
            <>
              <span className="font-medium text-foreground">{baseLabel}</span> is this supplier&apos;s
              own starting price. Add other rates that apply and how much cheaper they are than{" "}
              {baseLabel}. The starred rate is the one quotes use.
            </>
          ) : (
            "Configure rate types in Settings before adding applicable rates."
          )}
        </p>
      </div>

      {canEditBase ? (
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="supplier-base-rate" className="text-xs font-medium">
            Base rate
          </Label>
          <Select value={baseRateType?.id ?? ""} onValueChange={requestBaseChange}>
            <SelectTrigger id="supplier-base-rate" className="w-56">
              <SelectValue placeholder="Select the base rate" />
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
      ) : baseRateType ? (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Base rate</Label>
          <Badge variant="secondary">{baseLabel}</Badge>
          <span className="text-xs text-muted-foreground">Baseline · 0% markdown</span>
        </div>
      ) : null}

      {baseRateType ? (
        <div className="space-y-2">
          {/* The base rate is listed first so it can be starred like any other rate. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
            <div className="flex items-center gap-2">
              <StarControl rateTypeId={baseRateType.id} name={baseRateType.name} />
              <Badge variant="outline">{baseRateType.name}</Badge>
              <span className="text-xs text-muted-foreground">Baseline · 0%</span>
            </div>
            {quotedRateTypeId === baseRateType.id ? quotedBadge : null}
          </div>

          {applied.map((adjustment) => {
            const rateType = rateTypeById.get(adjustment.rateTypeId)
            const name = rateType?.name ?? "Unknown rate"
            return (
              <div
                key={adjustment.rateTypeId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="flex items-center gap-2">
                  <StarControl rateTypeId={adjustment.rateTypeId} name={name} />
                  <Badge variant="outline">{name}</Badge>
                  {!isEditing ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {adjustment.discountPct.toFixed(2)}% off {baseLabel}
                    </span>
                  ) : null}
                  {quotedRateTypeId === adjustment.rateTypeId ? quotedBadge : null}
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
                        % off {baseLabel}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={REMOVE_ICON_BUTTON_CLASS}
                      aria-label={`Remove ${name}`}
                      onClick={() => removeRate(adjustment.rateTypeId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}

          {applied.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No additional rates apply to this supplier.
            </p>
          ) : null}
        </div>
      ) : null}

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
        open={pendingBaseRateTypeId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingBaseRateTypeId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the base rate to {pendingBaseLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every percentage on this supplier resets to 0% — they were measured against{" "}
              {baseLabel}, and there is no safe way to re-express them against {pendingBaseLabel}.
              The starred rate moves back to {pendingBaseLabel}, so quotes price at it until you
              star another. {baseLabel} stays listed so its existing rate cards keep their tab;
              re-enter each percentage afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBaseChange}>
              Change base rate and reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
