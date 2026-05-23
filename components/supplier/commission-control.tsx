"use client"

import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import type { CommissionKind } from "@/lib/types"

export interface CommissionControlValue {
  type: CommissionKind | null
  value: number | null
}

interface CommissionControlProps {
  value: CommissionControlValue
  onChange: (next: CommissionControlValue) => void
  isEditing: boolean
  label?: string
  description?: string
  placeholder?: string
  onClear?: () => void
  clearLabel?: string
  inherited?: { type: CommissionKind | null; value: number | null } | null
  inheritedSourceLabel?: string
}

function formatCommission(
  type: CommissionKind | null,
  value: number | null,
): string {
  if (type === null || value === null || !Number.isFinite(value)) return "No commission"
  if (type === "percent") return `${value.toFixed(2)}%`
  return `R ${value.toFixed(2)} / pax`
}

export function CommissionControl({
  value,
  onChange,
  isEditing,
  label,
  description,
  placeholder,
  onClear,
  clearLabel,
  inherited,
  inheritedSourceLabel,
}: CommissionControlProps) {
  const activeType: CommissionKind = value.type ?? "percent"
  const inheritedFormatted = inherited
    ? formatCommission(inherited.type, inherited.value)
    : null
  const showInherited =
    inheritedFormatted && inheritedFormatted !== "No commission" && (value.type === null || value.value === null)

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {label ? <p className="text-sm font-semibold text-foreground">{label}</p> : null}
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {isEditing && onClear && (value.type !== null || value.value !== null) ? (
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            onClick={onClear}
          >
            {clearLabel ?? "Clear"}
          </button>
        ) : null}
      </div>

      {isEditing ? (
        <div className="flex flex-wrap items-end gap-2">
          <div
            role="radiogroup"
            aria-label="Commission shape"
            className="inline-flex rounded-md border bg-muted p-0.5"
          >
            {(
              [
                { key: "percent" as const, label: "% Markup" },
                { key: "per_person" as const, label: "Per Person" },
              ]
            ).map((option) => {
              const selected = activeType === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() =>
                    onChange({ type: option.key, value: value.value ?? 0 })
                  }
                  className={`px-2.5 py-1 text-xs rounded-sm transition-colors ${
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Value</Label>
            <NumericInput
              min="0"
              step={activeType === "percent" ? "0.01" : "1"}
              nullable
              value={value.value}
              placeholder={placeholder ?? (showInherited ? "inherited" : "0")}
              onValueChange={(next) =>
                onChange({ type: value.type ?? activeType, value: next })
              }
            />
          </div>
          <span className="text-sm text-muted-foreground pb-2">
            {activeType === "percent" ? "%" : "/ pax"}
          </span>
        </div>
      ) : null}

      <div className="text-xs text-muted-foreground tabular-nums">
        Resolves to: {formatCommission(value.type, value.value)}
        {showInherited ? (
          <>
            {" "}
            <span className="text-muted-foreground/70">
              ({inheritedFormatted}
              {inheritedSourceLabel ? ` · ${inheritedSourceLabel}` : ""})
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}
