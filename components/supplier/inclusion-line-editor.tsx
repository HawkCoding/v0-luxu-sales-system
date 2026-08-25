"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BufferedInput } from "@/components/ui/buffered-input"
import { BufferedTextarea } from "@/components/ui/buffered-textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EditableInclusionLine } from "@/lib/inclusions/editable-line"
import {
  countSectionLines,
  createEmptySection,
  flattenSections,
  groupIntoSections,
  replaceListLines,
  sectionItemsFromText,
  sectionItemsToText,
  type InclusionList,
  type InclusionSection,
} from "@/lib/inclusions/sections"

export type { EditableInclusionLine } from "@/lib/inclusions/editable-line"

/** The API rejects a supplier write once one list holds more than this many rows
 * (app/api/suppliers/schemas.ts). Warn well before the row is actually rejected. */
const LINE_WARNING_THRESHOLD = 180
const LINE_HARD_LIMIT = 200

const REMOVE_ICON_BUTTON_CLASS =
  "border-muted-foreground/25 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"

function moveSection(sections: InclusionSection[], index: number, direction: -1 | 1): InclusionSection[] {
  const target = index + direction
  if (target < 0 || target >= sections.length) return sections
  const next = [...sections]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

interface InclusionLineEditorProps {
  /** The full shared array -- both lists live in one array (see SupplierFormState.inclusionLines);
   * this editor only touches rows matching `list`. */
  lines: EditableInclusionLine[]
  list: InclusionList
  /** Train operators only: shows the journey/rate tag selects. Every other kind's bullets always
   * apply regardless of journey or rate, so the controls would just be visual noise. */
  showTags: boolean
  onChange: (next: EditableInclusionLine[]) => void
  idPrefix: string
  /** Rendered above the help text, e.g. a <Label> + badge pair. Owned by the caller so it can add
   * an "External" badge without this component knowing about that convention. */
  header: React.ReactNode
  helpText: string
}

/**
 * Edits one list (inclusions or exclusions) as a series of sections -- an optional heading, a
 * Journey/Rate tag pair, and a textarea of items that all share those tags. Section state is held
 * locally, seeded once from `lines`, so a section's textarea keeps its React identity while typing;
 * the caller re-seeds by remounting with a fresh `key` when a different supplier loads (see
 * components/supplier-detail-view.tsx, keyed on form.id).
 */
export function InclusionLineEditor({
  lines,
  list,
  showTags,
  onChange,
  idPrefix,
  header,
  helpText,
}: InclusionLineEditorProps) {
  const [sections, setSections] = useState<InclusionSection[]>(() => groupIntoSections(lines, list))

  const commit = (next: InclusionSection[]) => {
    setSections(next)
    onChange(replaceListLines(lines, list, flattenSections(next, list)))
  }

  const updateSection = (id: string, patch: Partial<Omit<InclusionSection, "id" | "items">>) => {
    commit(sections.map((section) => (section.id === id ? { ...section, ...patch } : section)))
  }

  const updateSectionItems = (id: string, value: string) => {
    commit(
      sections.map((section) =>
        section.id === id ? { ...section, items: sectionItemsFromText(section.items, value) } : section
      )
    )
  }

  const removeSection = (id: string) => {
    commit(sections.filter((section) => section.id !== id))
  }

  const addSection = () => {
    commit([...sections, createEmptySection()])
  }

  const lineCount = countSectionLines(sections)

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {header}
        <p className="text-xs text-muted-foreground">{helpText}</p>
      </div>

      {sections.length > 0 ? (
        <div className="space-y-2">
          {sections.map((section, index) => (
            <div key={section.id} className="rounded-lg border p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <BufferedInput
                  id={`${idPrefix}-heading-${section.id}`}
                  value={section.heading ?? ""}
                  onValueChange={(value) => updateSection(section.id, { heading: value })}
                  placeholder="Section heading (optional)"
                  className="font-semibold"
                  maxLength={1000}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={index === 0}
                    aria-label="Move section up"
                    onClick={() => commit(moveSection(sections, index, -1))}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={index === sections.length - 1}
                    aria-label="Move section down"
                    onClick={() => commit(moveSection(sections, index, 1))}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={REMOVE_ICON_BUTTON_CLASS}
                    aria-label="Remove section"
                    onClick={() => removeSection(section.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <BufferedTextarea
                id={`${idPrefix}-items-${section.id}`}
                value={sectionItemsToText(section)}
                onValueChange={(value) => updateSectionItems(section.id, value)}
                placeholder={"e.g. High Tea\nWi-Fi\nRoom service and bar facilities"}
                rows={4}
                maxLength={8000}
              />

              {showTags && (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor={`${idPrefix}-journey-${section.id}`} className="text-xs text-muted-foreground">
                      Journey
                    </Label>
                    <Select
                      value={section.journeyTag ?? "any"}
                      onValueChange={(value) =>
                        updateSection(section.id, {
                          journeyTag: value === "any" ? null : (value as "short" | "long"),
                        })
                      }
                    >
                      <SelectTrigger id={`${idPrefix}-journey-${section.id}`} className="h-7 w-24 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor={`${idPrefix}-rate-${section.id}`} className="text-xs text-muted-foreground">
                      Rate
                    </Label>
                    <Select
                      value={section.rateTag ?? "any"}
                      onValueChange={(value) =>
                        updateSection(section.id, {
                          rateTag: value === "any" ? null : (value as "international" | "resident"),
                        })
                      }
                    >
                      <SelectTrigger id={`${idPrefix}-rate-${section.id}`} className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="international">Intl</SelectItem>
                        <SelectItem value="resident">Resident</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No sections added yet.
        </div>
      )}

      <div className="flex items-center justify-between">
        {lineCount >= LINE_WARNING_THRESHOLD ? (
          <p className="text-xs text-amber-600">
            {lineCount} / {LINE_HARD_LIMIT} lines -- approaching the per-list limit.
          </p>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" variant="outline" onClick={addSection}>
          <Plus className="mr-2 h-4 w-4" />
          Add section
        </Button>
      </div>
    </div>
  )
}
