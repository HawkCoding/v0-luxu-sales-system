"use client"

import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addBackButtonId } from "@/components/packages/pax-group-editor-context"

interface LegNotInGroupRowProps {
  legId: string
  legName: string
  /** "Suite", "Room", "Cabin". */
  noun: string
  /** The active group's position. */
  position: number
  onAddBack: () => void
}

/**
 * A selected service the active suite isn't on, folded to one dashed row in the per-suite view.
 * The words carry the meaning -- no strike-through, no amount.
 */
export function LegNotInGroupRow({ legId, legName, noun, position, onAddBack }: LegNotInGroupRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
      <span>
        <span className="font-medium text-foreground">{legName}</span> — not in this {noun.toLowerCase()}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        id={addBackButtonId(legId)}
        aria-label={`Add ${legName} back to ${noun} ${position}`}
        onClick={onAddBack}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Add back
      </Button>
    </div>
  )
}
