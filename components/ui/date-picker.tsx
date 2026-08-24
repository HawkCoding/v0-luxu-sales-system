'use client'

import * as React from 'react'
import { CalendarCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar, getCalendarNavMonthBounds } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDisplayDate, parseDateOnly, toDateOnlyIso } from '@/lib/date-format'
import { cn } from '@/lib/utils'

interface DatePickerProps {
  value: string | null | undefined
  onChange: (value: string | undefined) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  buttonClassName?: string
  popoverClassName?: string
  align?: React.ComponentProps<typeof PopoverContent>['align']
  fromYear?: number
  toYear?: number
  /** ISO date (yyyy-mm-dd); earlier days are not selectable. */
  minDate?: string | null
  /** Accessible name when no visible <Label> is wired to `id`. */
  'aria-label'?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  id,
  className,
  buttonClassName,
  popoverClassName,
  align = 'start',
  fromYear,
  toYear,
  minDate,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selectedDate = parseDateOnly(value)
  const minSelectable = parseDateOnly(minDate)
  const { startMonth: navStart, endMonth: navEnd } = getCalendarNavMonthBounds()
  const startMonth = fromYear != null ? new Date(fromYear, 0, 1) : undefined
  const endMonth = toYear != null ? new Date(toYear, 11, 31) : undefined

  return (
    <div className={cn('w-full', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(
              'h-10 w-full justify-start text-left font-normal',
              !selectedDate && 'text-muted-foreground',
              buttonClassName,
            )}
          >
            <CalendarCheck className="mr-2 h-4 w-4" />
            <span>{selectedDate ? formatDisplayDate(selectedDate) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn('w-auto p-2', popoverClassName)} align={align}>
          <Calendar
            mode="single"
            selected={selectedDate}
            startMonth={startMonth ?? navStart}
            endMonth={endMonth ?? navEnd}
            disabled={minSelectable ? { before: minSelectable } : undefined}
            onSelect={(date) => {
              if (!date) {
                onChange(undefined)
                return
              }

              onChange(toDateOnlyIso(date))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
