import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface AnchorOption<T extends string> {
  value: T
  label: string
  hint: string
}

interface AnchorDateSectionProps<T extends string> {
  label: string
  options: AnchorOption<T>[]
  value: T | null
  onChange: (next: T) => void
  /** Option values that can't be picked right now (e.g. no leg above to anchor to) — "custom" is
   *  never disabled since it never depends on context. */
  disabledValues?: T[]
  children: React.ReactNode
}

/** Shared chrome for a pill-toggle + resolved-date box, used by the hotel stay-dates picker, the
 *  transfer pickup-date picker, and the flight departure/arrival date pickers so they all look
 *  like one pattern. */
export function AnchorDateSection<T extends string>({
  label,
  options,
  value,
  onChange,
  disabledValues = [],
  children,
}: AnchorDateSectionProps<T>) {
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
