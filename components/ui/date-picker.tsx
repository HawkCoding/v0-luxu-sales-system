'use client'

import * as React from 'react'
import { CalendarCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar, getCalendarNavMonthBounds } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDisplayDate } from '@/lib/date-format'
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

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateOnly(value: string | null | undefined): Date | undefined {
  if (!value) return undefined
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return undefined

  const [, year, month, day] = match
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

function toDateOnlyIso(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
