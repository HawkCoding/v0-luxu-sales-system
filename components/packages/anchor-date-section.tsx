import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import type { ServiceDateAnchor } from "@/lib/types"

interface AnchorOption {
  value: ServiceDateAnchor
  label: string
  hint: string
}

interface AnchorDateSectionProps {
  label: string
  options: AnchorOption[]
  value: ServiceDateAnchor | null
  onChange: (next: ServiceDateAnchor) => void
  /** Anchor values that can't be picked right now (e.g. no leg above to anchor to) — "custom" is
   *  never disabled since it never depends on context. */
  disabledValues?: ServiceDateAnchor[]
  children: React.ReactNode
}

/** Shared chrome for a Pre/Post/Custom date-anchor toggle, used by both the hotel stay-dates
 *  picker and the transfer pickup-date picker so the two look like one pattern. */
export function AnchorDateSection({
  label,
  options,
  value,
  onChange,
  disabledValues = [],
  children,
}: AnchorDateSectionProps) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <div className="flex flex-wrap gap-1">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={value === option.value ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              aria-pressed={value === option.value}
              title={option.hint}
              disabled={disabledValues.includes(option.value)}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      {children}
    </div>
  )
}
