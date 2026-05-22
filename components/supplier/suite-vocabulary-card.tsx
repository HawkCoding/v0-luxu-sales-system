"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BufferedInput } from "@/components/ui/buffered-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SortableList } from "@/components/ui/sortable-list"

export interface EditableVocabularyValue {
  id: string
  name: string
  sortOrder: number
  archivedAt: string | null
}

export interface SuiteVocabularyCardProps {
  bedroomTypes: EditableVocabularyValue[]
  bedroomLayouts: EditableVocabularyValue[]
  bathroomTypes: EditableVocabularyValue[]
  onChangeBedroomTypes: (next: EditableVocabularyValue[]) => void
  onChangeBedroomLayouts: (next: EditableVocabularyValue[]) => void
  onChangeBathroomTypes: (next: EditableVocabularyValue[]) => void
  isEditing: boolean
}

interface VocabularySectionProps {
  title: string
  description: string
  values: EditableVocabularyValue[]
  onChange: (next: EditableVocabularyValue[]) => void
  isEditing: boolean
}

function reorderByIds(
  values: EditableVocabularyValue[],
  orderedIds: string[],
): EditableVocabularyValue[] {
  const byId = new Map(values.map((value) => [value.id, value]))
  return orderedIds.flatMap((id, index) => {
    const value = byId.get(id)
    return value ? [{ ...value, sortOrder: index }] : []
  })
}

function VocabularySection({
  title,
  description,
  values,
  onChange,
  isEditing,
}: VocabularySectionProps) {
  const [draftName, setDraftName] = useState("")

  function handleAdd() {
    const trimmed = draftName.trim()
    if (!trimmed) return
    if (
      values.some((value) => value.name.trim().toLowerCase() === trimmed.toLowerCase())
    ) {
      setDraftName("")
      return
    }
    const next: EditableVocabularyValue = {
      id: crypto.randomUUID(),
      name: trimmed,
      sortOrder: values.length,
      archivedAt: null,
    }
    onChange([...values, next])
    setDraftName("")
  }

  function handleRename(id: string, name: string) {
    onChange(values.map((value) => (value.id === id ? { ...value, name } : value)))
  }

  function handleRemove(id: string) {
    onChange(
      values
        .filter((value) => value.id !== id)
        .map((value, index) => ({ ...value, sortOrder: index })),
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {isEditing ? (
        <>
          {values.length > 0 ? (
            <SortableList
              items={values}
              onReorder={(orderedIds) => onChange(reorderByIds(values, orderedIds))}
              renderItem={({ item, dragHandle }) => (
                <div className="flex items-center gap-2 rounded-lg border p-2">
                  {dragHandle}
                  <BufferedInput
                    value={item.name}
                    onValueChange={(value) => handleRename(item.id, value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => handleRemove(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              No {title.toLowerCase()} yet.
            </div>
          )}
          <div className="flex items-center gap-2">
            <BufferedInput
              value={draftName}
              onValueChange={setDraftName}
              placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}...`}
              className="flex-1"
            />
            <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </>
      ) : values.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value.id} variant="outline">
              {value.name}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No {title.toLowerCase()} configured.</p>
      )}
    </div>
  )
}

export function SuiteVocabularyCard({
  bedroomTypes,
  bedroomLayouts,
  bathroomTypes,
  onChangeBedroomTypes,
  onChangeBedroomLayouts,
  onChangeBathroomTypes,
  isEditing,
}: SuiteVocabularyCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Suite Vocabulary</CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure the bedroom and bathroom variants this supplier offers. Drag to reorder.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <VocabularySection
          title="Bedroom Types"
          description="e.g. Twin, Double, King."
          values={bedroomTypes}
          onChange={onChangeBedroomTypes}
          isEditing={isEditing}
        />
        <VocabularySection
          title="Bedroom Layouts"
          description="e.g. L-Shape, Crosswise, Lengthwise."
          values={bedroomLayouts}
          onChange={onChangeBedroomLayouts}
          isEditing={isEditing}
        />
        <VocabularySection
          title="Bathroom Types"
          description="e.g. Shower, Bath, Both."
          values={bathroomTypes}
          onChange={onChangeBathroomTypes}
          isEditing={isEditing}
        />
      </CardContent>
    </Card>
  )
}
