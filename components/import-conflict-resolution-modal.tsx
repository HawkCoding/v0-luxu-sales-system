"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { cn } from "@/lib/utils"

export interface ConflictCandidateRow {
  id: string
  title: string
  first_name: string
  last_name: string
  email: string
  phone: string
  country: string
  sourceLabel: string
}

export interface ImportConflictGroup {
  email: string
  rows: ConflictCandidateRow[]
}

interface ImportConflictResolutionModalProps {
  open: boolean
  conflicts: ImportConflictGroup[]
  onOpenChange: (open: boolean) => void
  onConfirm: (selections: Record<string, string>) => void
}

const FIELD_ROWS: Array<{ key: keyof ConflictCandidateRow; label: string }> = [
  { key: "title", label: "Title" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
]

function asDisplayValue(value: string): string {
  return value.trim().length > 0 ? value : "—"
}

/** Normalizes `filename.csv row 21` into a single readable line for the card header. */
function formatSourceLine(sourceLabel: string): string {
  const match = sourceLabel.match(/^(.+?)\s+row\s+(\d+)$/i)
  if (match) {
    const file = match[1].trim()
    const row = match[2]
    return `${file} · row ${row}`
  }
  return sourceLabel
}

function initialSelectionsFromConflicts(conflicts: ImportConflictGroup[]): Record<string, string> {
  return Object.fromEntries(conflicts.map((group) => [group.email, group.rows[0]?.id ?? ""]))
}

export function ImportConflictResolutionModal({
  open,
  conflicts,
  onOpenChange,
  onConfirm,
}: ImportConflictResolutionModalProps) {
  const [index, setIndex] = useState(0)
  const [selections, setSelections] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setSelections(initialSelectionsFromConflicts(conflicts))
  }, [open, conflicts])

  const current = conflicts[index] ?? null
  const allResolved = useMemo(
    () => conflicts.every((conflict) => Boolean(selections[conflict.email])),
    [conflicts, selections],
  )

  const resolvedCount = useMemo(
    () => conflicts.filter((conflict) => Boolean(selections[conflict.email])).length,
    [conflicts, selections],
  )

  const resolutionProgress =
    conflicts.length === 0 ? 0 : Math.round((resolvedCount / conflicts.length) * 100)

  const differingFields = useMemo(() => {
    if (!current) return new Set<string>()
    const fields: Array<keyof ConflictCandidateRow> = [
      "title",
      "first_name",
      "last_name",
      "phone",
      "country",
    ]
    return new Set(
      fields.filter((field) => {
        const values = new Set(current.rows.map((row) => row[field].trim().toLowerCase()))
        return values.size > 1
      }),
    )
  }, [current])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-sans">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            Resolve duplicate customer details
          </DialogTitle>
          <DialogDescription>
            These emails appear more than once with different customer details. Select which version to keep for the
            customer record. All selected rows still create historical bookings.
          </DialogDescription>
        </DialogHeader>

        {current ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <p className="text-sm font-medium text-foreground">
                  Conflict {index + 1} of {conflicts.length}
                </p>
                <Badge variant="outline" className="w-fit max-w-full font-mono text-xs font-normal break-all">
                  {current.email}
                </Badge>
              </div>
              <Progress value={resolutionProgress} className="h-1.5" aria-label="Resolution progress" />
            </div>

            <RadioGroup
              value={selections[current.email] ?? ""}
              onValueChange={(value) => {
                setSelections((prev) => ({ ...prev, [current.email]: value }))
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              {current.rows.map((row) => {
                const selected = selections[current.email] === row.id
                const sourceLine = formatSourceLine(row.sourceLabel)
                return (
                  <label
                    key={row.id}
                    htmlFor={`conflict-${current.email}-${row.id}`}
                    className={cn(
                      "cursor-pointer overflow-hidden rounded-lg border transition-shadow",
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary"
                        : "hover:bg-muted/30",
                    )}
                  >
                    <div className="rounded-t-[inherit] bg-muted/40 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <RadioGroupItem id={`conflict-${current.email}-${row.id}`} value={row.id} className="shrink-0" />
                          <span className="text-sm font-medium leading-none">Use this version</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 pt-0.5" aria-hidden="true">
                          {selected ? (
                            <CheckCircle2 className="size-5 text-primary" />
                          ) : (
                            <span className="inline-flex size-5 items-center justify-center rounded-full border-2 border-muted-foreground/35" />
                          )}
                        </div>
                      </div>
                      <p className="mt-2 truncate text-[11px] leading-snug text-muted-foreground" title={row.sourceLabel}>
                        {sourceLine}
                      </p>
                    </div>

                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 p-3 pt-2 text-xs">
                      {FIELD_ROWS.map(({ key, label }) => {
                        const differs = differingFields.has(key)
                        return (
                          <Fragment key={key}>
                            <span
                              className={cn(
                                "shrink-0 rounded px-2 py-1.5 text-muted-foreground",
                                "border-l-2 pl-2",
                                differs
                                  ? "border-amber-500 font-medium text-amber-600 dark:text-amber-500"
                                  : "border-transparent",
                              )}
                            >
                              {label}
                            </span>
                            <span className="min-w-0 break-words rounded px-2 py-1.5 font-medium text-foreground">
                              {asDisplayValue(String(row[key]))}
                            </span>
                          </Fragment>
                        )
                      })}
                    </div>
                  </label>
                )
              })}
            </RadioGroup>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No conflicts found.</p>
        )}

        <DialogFooter className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIndex((value) => Math.min(conflicts.length - 1, value + 1))}
              disabled={conflicts.length === 0 || index >= conflicts.length - 1}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground sm:flex-1 sm:px-2">
            {resolvedCount} of {conflicts.length} resolved
          </p>

          <Button
            type="button"
            size="sm"
            onClick={() => onConfirm(selections)}
            disabled={!allResolved || conflicts.length === 0}
          >
            Resolve All And Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
