"use client"

import { parseBulletLines, stripBulletMarker } from "@/lib/inclusions/bullet-lines"
import { cn } from "@/lib/utils"

interface BulletLineListProps {
  /** Stored lines, e.g. `supplier.inclusions`. */
  values: readonly string[] | null | undefined
  /**
   * Strip the `#` marker and print every line as a plain bullet. Exclusions are pooled across
   * suppliers on the quote, so a subheading typed there never survives — see
   * `collectQuoteExclusions` in `lib/quotes/quote-presentation.ts`.
   */
  flatten?: boolean
  className?: string
}

/**
 * Renders stored inclusion/exclusion lines the way they print on the quote itinerary: a `#` line is
 * a bold, marker-free subheading and everything else is a bullet. Shared by the supplier form's
 * live preview and the supplier's read-only card so the two cannot drift.
 */
export function BulletLineList({ values, flatten = false, className }: BulletLineListProps) {
  const lines = parseBulletLines(values)
  if (lines.length === 0) return null

  if (flatten) {
    return (
      <ul className={cn("list-disc space-y-1 pl-4 text-sm text-muted-foreground", className)}>
        {(values ?? []).map((raw, index) => {
          const text = stripBulletMarker(raw)
          if (!text) return null
          return <li key={index}>{text}</li>
        })}
      </ul>
    )
  }

  return (
    <ul className={cn("space-y-1 text-sm", className)}>
      {lines.map((line, index) => (
        <li
          key={index}
          className={
            line.kind === "heading"
              ? "mt-2 list-none font-semibold text-foreground first:mt-0"
              : "ml-4 list-disc text-muted-foreground"
          }
        >
          {line.text}
        </li>
      ))}
    </ul>
  )
}
