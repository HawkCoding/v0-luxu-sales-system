"use client"

import { BulletLineList } from "@/components/supplier/bullet-line-list"
import { parseBulletLines, splitBulletLines } from "@/lib/inclusions/bullet-lines"

interface InclusionPreviewProps {
  /** The raw one-per-line textarea value. */
  value: string
}

/**
 * Shows how the typed lines will print under this supplier in the quote itinerary, so a `#`
 * subheading can be checked without sending a test quote. Renders nothing until a subheading is
 * actually used — a plain dash list needs no preview.
 */
export function InclusionPreview({ value }: InclusionPreviewProps) {
  const stored = splitBulletLines(value)
  if (!parseBulletLines(stored).some((line) => line.kind === "heading")) return null

  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quote itinerary preview
      </p>
      <BulletLineList values={stored} className="space-y-0.5 text-xs" />
    </div>
  )
}
