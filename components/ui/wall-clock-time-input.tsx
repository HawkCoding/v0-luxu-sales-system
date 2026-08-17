'use client'

import * as React from 'react'

import { Input } from '@/components/ui/input'
import { normalizeTimeInput } from '@/lib/date-time-field'
import { cn } from '@/lib/utils'

interface WallClockTimeInputProps {
  /** 24-hour HH:MM, or null when unset. */
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

/**
 * A standalone 24-hour time field for a wall-clock time that belongs to no instant — a flight's
 * departure at its origin airport, its arrival at the destination. Deliberately not
 * {@link DateTimePicker}, which round-trips through a UTC ISO timestamp: these values are stored as
 * a Postgres `time` beside their own `date` column precisely so no timezone is ever applied to
 * them. Deliberately not `<input type="time">` either — the native control renders AM/PM on some
 * locales, and these times print in 24-hour "10h00" house style on client documents.
 *
 * Free text while focused (so half-typed input isn't fought), normalized on blur:
 * `normalizeTimeInput` accepts "930", "9:3", "0930" and rejects a genuine typo like "25:00" rather
 * than clamping it into a plausible-looking wrong time.
 */
export function WallClockTimeInput({
  value,
  onChange,
  disabled = false,
  id,
  className,
  'aria-label': ariaLabel,
}: WallClockTimeInputProps) {
  const committed = value ?? ''

  const [draft, setDraft] = React.useState(committed)
  const [lastSynced, setLastSynced] = React.useState(committed)

  if (committed !== lastSynced) {
    setLastSynced(committed)
    setDraft(committed)
  }

  return (
    <Input
      id={id}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        const normalized = normalizeTimeInput(event.target.value)
        setDraft(normalized)
        onChange(normalized || null)
      }}
      placeholder="HH:MM"
      inputMode="numeric"
      maxLength={5}
      aria-label={ariaLabel ?? 'Time (24-hour)'}
      className={cn('h-10 w-20 text-center', className)}
    />
  )
}
