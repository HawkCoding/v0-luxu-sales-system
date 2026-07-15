'use client'

import * as React from 'react'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { buildQuickOptions, isoDateDaysFromNow, QUOTE_VALIDITY_QUICK_OPTIONS } from '@/lib/quotes/quote-validity'
import { cn } from '@/lib/utils'

interface QuoteValidityPickerProps {
  value: string | null | undefined
  onChange: (value: string | undefined) => void
  disabled?: boolean
  id?: string
  className?: string
}

export function QuoteValidityPicker({ value, onChange, disabled, id, className }: QuoteValidityPickerProps) {
  const [orgDefaultDays, setOrgDefaultDays] = React.useState<number | null>(null)

  React.useEffect(() => {
    let cancelled = false

    fetch('/api/settings/quote-validity')
      .then((response) => response.json())
      .then((data: { quoteValidityDays?: number }) => {
        if (!cancelled && typeof data.quoteValidityDays === 'number') {
          setOrgDefaultDays(data.quoteValidityDays)
        }
      })
      .catch(() => {
        // Quick buttons degrade to the plain fixed options below.
      })

    return () => {
      cancelled = true
    }
  }, [])

  const quickOptions =
    orgDefaultDays != null
      ? buildQuickOptions(orgDefaultDays)
      : QUOTE_VALIDITY_QUICK_OPTIONS.map((days) => ({ days, isOrgDefault: false }))

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-1.5">
        {quickOptions.map((option) => {
          const optionDate = isoDateDaysFromNow(option.days)
          const isSelected = value === optionDate

          return (
            <Button
              key={option.days}
              type="button"
              size="sm"
              variant={isSelected ? 'default' : option.isOrgDefault ? 'secondary' : 'outline'}
              disabled={disabled}
              onClick={() => onChange(isoDateDaysFromNow(option.days))}
            >
              {option.days} days
            </Button>
          )
        })}
      </div>
      <DatePicker id={id} value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}
