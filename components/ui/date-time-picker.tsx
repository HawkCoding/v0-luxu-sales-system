'use client'

import * as React from 'react'

import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { joinLocalDateTime, normalizeTimeInput, splitLocalDateTime } from '@/lib/date-time-field'
import { cn } from '@/lib/utils'

interface DateTimePickerProps {
  /** Full ISO timestamp, or null when unset. */
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  id?: string
  className?: string
  datePlaceholder?: string
  'aria-label'?: string
}

/**
 * Date + 24-hour time, as two controls over one ISO timestamp. The date half is
 * the shared DatePicker (so it reads dd/mm/yyyy like everything else); the time
 * half is a plain text field rather than <input type="time"> because the native
 * control renders AM/PM on some locales.
 */
export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  id,
  className,
  datePlaceholder = 'Select date',
  'aria-label': ariaLabel,
}: DateTimePickerProps) {
  const parts = splitLocalDateTime(value)

  // The time field is free-text while focused, so hold the raw keystrokes here
  // and only normalize on blur. Re-syncs whenever the committed value changes.
  const [timeDraft, setTimeDraft] = React.useState(parts.time)
  const [lastSyncedTime, setLastSyncedTime] = React.useState(parts.time)

  if (parts.time !== lastSyncedTime) {
    setLastSyncedTime(parts.time)
    setTimeDraft(parts.time)
  }

  function commitTime(raw: string) {
    const normalized = normalizeTimeInput(raw)
    setTimeDraft(normalized)

    // Without a date there is no instant to attach the time to; keep the text
    // on screen and wait for the user to pick a day.
    if (!parts.date) return
    onChange(joinLocalDateTime(parts.date, normalized))
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <DatePicker
        id={id}
        value={parts.date}
        disabled={disabled}
        placeholder={datePlaceholder}
        aria-label={ariaLabel}
        className="flex-1"
        onChange={(date) => {
          if (!date) {
            onChange(null)
            return
          }
          onChange(joinLocalDateTime(date, timeDraft))
        }}
      />
      <Input
        value={timeDraft}
        disabled={disabled}
        onChange={(event) => setTimeDraft(event.target.value)}
        onBlur={(event) => commitTime(event.target.value)}
        placeholder="HH:MM"
        inputMode="numeric"
        maxLength={5}
        aria-label={ariaLabel ? `${ariaLabel} time` : 'Time (24-hour)'}
        className="h-10 w-20 text-center"
      />
    </div>
  )
}
