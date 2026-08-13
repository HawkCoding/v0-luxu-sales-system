"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { CURRENCIES } from "@/lib/types"
import { isSupportedCurrency } from "@/lib/money"

interface CurrencySelectProps {
  value: string
  onChange: (currency: string) => void
  id?: string
  className?: string
  triggerClassName?: string
  /** Pass null to render without a label (compact rows). */
  label?: string | null
  disabled?: boolean
  /** Show only the code ("USD") rather than the full "USD — US Dollar" line. Used in tight rows. */
  compact?: boolean
}

/**
 * The one currency picker. Replaces the free-text box that let any 10-character string be saved
 * as a currency — a typo there silently mispriced a quote by whatever the real rate was.
 *
 * A value outside CURRENCIES (legacy free-text rows) is kept as an extra option rather than
 * snapped to the default, so an old rate card still renders what it actually says.
 */
export function CurrencySelect({
  value,
  onChange,
  id,
  className,
  triggerClassName,
  label = "Currency",
  disabled,
  compact = false,
}: CurrencySelectProps) {
  const current = (value ?? "").trim().toUpperCase()
  const isLegacy = current.length > 0 && !isSupportedCurrency(current)

  return (
    <div className={cn("space-y-1.5", className)}>
      {label !== null && <Label htmlFor={id}>{label}</Label>}
      <Select value={current || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn("h-9", compact && "h-8 w-24", triggerClassName)}
          aria-label={label === null ? "Currency" : undefined}
        >
          <SelectValue placeholder="Currency" />
        </SelectTrigger>
        <SelectContent>
          {CURRENCIES.map((currency) => (
            <SelectItem key={currency.value} value={currency.value}>
              {compact ? currency.value : currency.label}
            </SelectItem>
          ))}
          {isLegacy ? (
            <SelectItem value={current}>{current} — no longer offered</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}
