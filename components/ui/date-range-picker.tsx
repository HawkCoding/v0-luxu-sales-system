'use client'

import * as React from 'react'
import { CalendarCheck } from 'lucide-react'
import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar, getCalendarNavMonthBounds } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { formatDisplayDateShort, parseDateOnly, toDateOnlyIso } from '@/lib/date-format'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  from?: string
  to?: string
}

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  placeholder?: string
  className?: string
  buttonClassName?: string
  align?: React.ComponentProps<typeof PopoverContent>['align']
  disabled?: boolean
  'aria-label'?: string
}

interface Preset {
  label: string
  range: () => DateRangeValue
}

function toRange(from: Date, to: Date): DateRangeValue {
  return { from: toDateOnlyIso(from), to: toDateOnlyIso(to) }
}

function buildPresets(): Preset[] {
  const now = new Date()
  return [
    { label: 'Last 7 days', range: () => toRange(subDays(now, 6), now) },
    { label: 'Last 30 days', range: () => toRange(subDays(now, 29), now) },
    { label: 'This month', range: () => toRange(startOfMonth(now), endOfMonth(now)) },
    {
      label: 'Last month',
      range: () => {
        const lastMonth = subMonths(now, 1)
        return toRange(startOfMonth(lastMonth), endOfMonth(lastMonth))
      },
    },
    { label: 'This year', range: () => toRange(startOfYear(now), endOfYear(now)) },
  ]
}

function formatTriggerLabel(value: DateRangeValue, placeholder: string): string {
  if (value.from && value.to) {
    return `${formatDisplayDateShort(value.from)} – ${formatDisplayDateShort(value.to)}`
  }
  if (value.from) return `From ${formatDisplayDateShort(value.from)}`
  if (value.to) return `Until ${formatDisplayDateShort(value.to)}`
  return placeholder
}

/**
 * A single range popover replacing the from/to pair of independent `DatePicker`s (or, on the
 * bookings page, two full stacked calendars) that every list filter bar used to hand-roll.
 * Value is a pair of ISO date-only strings so it round-trips directly through URL search params.
 */
export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Date range',
  className,
  buttonClassName,
  align = 'start',
  disabled = false,
  'aria-label': ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const presets = React.useMemo(buildPresets, [])
  const { startMonth, endMonth } = getCalendarNavMonthBounds()

  const selected: DateRange | undefined = value.from || value.to
    ? { from: parseDateOnly(value.from), to: parseDateOnly(value.to) }
    : undefined

  const isActive = Boolean(value.from || value.to)

  function handleSelect(range: DateRange | undefined) {
    onChange({
      from: range?.from ? toDateOnlyIso(range.from) : undefined,
      to: range?.to ? toDateOnlyIso(range.to) : undefined,
    })
  }

  function handleClear() {
    onChange({ from: undefined, to: undefined })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'h-9 justify-start text-left font-normal',
            !isActive && 'text-muted-foreground',
            className,
            buttonClassName,
          )}
        >
          <CalendarCheck className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{formatTriggerLabel(value, placeholder)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex">
          <div className="flex flex-col gap-1 border-r p-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start text-xs font-normal"
                onClick={() => onChange(preset.range())}
              >
                {preset.label}
              </Button>
            ))}
            <Separator className="my-1" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-xs font-normal text-muted-foreground"
              onClick={handleClear}
              disabled={!isActive}
            >
              Clear
            </Button>
          </div>
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={selected}
            startMonth={startMonth}
            endMonth={endMonth}
            onSelect={handleSelect}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
