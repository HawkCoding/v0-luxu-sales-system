"use client"

import { useEffect, useState } from "react"
import { Award, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isIncompleteClubMembership, MAX_CLUB_MEMBERSHIPS, type ClubMembership } from "@/lib/club-memberships"
import { cn } from "@/lib/utils"

interface ClubMemberNumbersEditorProps {
  value: ClubMembership[]
  onChange: (next: ClubMembership[]) => void
  /** Unique per editor on the page; prefixes input ids. */
  idPrefix: string
  readOnly?: boolean
  disabled?: boolean
  suggestions?: readonly string[]
  /** Small caption above the rows once there is at least one. */
  heading?: string
  className?: string
}

export function ClubMemberNumbersEditor({
  value,
  onChange,
  idPrefix,
  readOnly = false,
  disabled = false,
  suggestions,
  heading,
  className,
}: ClubMemberNumbersEditorProps) {
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const listId = `${idPrefix}-club-options`

  useEffect(() => {
    if (focusRow === null) return
    document.getElementById(`${idPrefix}-club-${focusRow}`)?.focus()
    setFocusRow(null)
  }, [focusRow, idPrefix])

  if (readOnly) {
    if (value.length === 0) {
      return <p className={cn("text-sm text-muted-foreground", className)}>None recorded</p>
    }
    return (
      <ul className={cn("space-y-1", className)}>
        {value.map((row, index) => (
          <li key={`${row.club}-${index}`} className="flex items-center gap-2 text-sm">
            <Award className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{row.club}</span>
            <span className="text-muted-foreground" aria-hidden="true">·</span>
            <span className="tabular-nums">{row.number}</span>
          </li>
        ))}
      </ul>
    )
  }

  const addRow = () => {
    onChange([...value, { club: "", number: "" }])
    setFocusRow(value.length)
  }

  const updateRow = (index: number, patch: Partial<ClubMembership>) => {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index: number) => {
    setActiveRow(null)
    onChange(value.filter((_, i) => i !== index))
  }

  if (value.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addRow}
        disabled={disabled}
        className={cn("-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground", className)}
      >
        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Club member number
      </Button>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {heading ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Award className="h-3.5 w-3.5" aria-hidden="true" />
          {heading}
        </p>
      ) : null}
      {suggestions && suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
      {value.map((row, index) => {
        // Hold the warning until focus leaves the row, so it doesn't fire mid-entry.
        const incomplete = isIncompleteClubMembership(row) && activeRow !== index
        const hintId = `${idPrefix}-club-hint-${index}`
        return (
          <div
            key={index}
            className="space-y-1"
            onFocus={() => setActiveRow(index)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveRow(null)
            }}
          >
            <div className="flex items-center gap-2">
              <Input
                id={`${idPrefix}-club-${index}`}
                value={row.club}
                onChange={(event) => updateRow(index, { club: event.target.value })}
                placeholder="Club / programme"
                aria-label={`Club or programme ${index + 1}`}
                aria-invalid={incomplete && !row.club.trim()}
                aria-describedby={incomplete ? hintId : undefined}
                list={suggestions && suggestions.length > 0 ? listId : undefined}
                autoComplete="off"
                maxLength={100}
                disabled={disabled}
                className="h-9 min-w-0 flex-1"
              />
              <Input
                id={`${idPrefix}-number-${index}`}
                value={row.number}
                onChange={(event) => updateRow(index, { number: event.target.value })}
                placeholder="Member number"
                aria-label={`Member number ${index + 1}`}
                aria-invalid={incomplete && !row.number.trim()}
                aria-describedby={incomplete ? hintId : undefined}
                autoComplete="off"
                maxLength={100}
                disabled={disabled}
                className="h-9 min-w-0 flex-1 tabular-nums"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(index)}
                disabled={disabled}
                aria-label={`Remove club member number ${index + 1}`}
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {incomplete ? (
              <p id={hintId} className="text-xs text-destructive">
                Add both the club and the member number.
              </p>
            ) : null}
          </div>
        )
      })}
      {value.length < MAX_CLUB_MEMBERSHIPS ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addRow}
          disabled={disabled}
          className="-ml-2 h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Add another
        </Button>
      ) : null}
    </div>
  )
}
