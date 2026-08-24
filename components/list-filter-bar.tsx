'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

export interface FilterChip {
  key: string
  label: string
  onRemove: () => void
}

interface ListFilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  /** Facet controls (FacetedFilter, DateRangePicker, ...) rendered next to the search box. */
  children?: React.ReactNode
  chips: FilterChip[]
  onClearAll: () => void
  resultCount: number
  totalCount: number
  /** Singular noun for the result line — "booking", "customer", "document", "payment". */
  noun: string
  /** True when search or any facet differs from its default — drives the summary row. */
  hasActiveFilters: boolean
  disabled?: boolean
  className?: string
}

/**
 * Shared compact filter toolbar for list pages (bookings, customers, documents, payments).
 * One row of search + facets, with a summary/chip row underneath that only takes up space
 * once a filter is actually active — the four hand-rolled "Filters" cards this replaces cost
 * ~180-200px of vertical space at rest for no reason.
 */
export function ListFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  children,
  chips,
  onClearAll,
  resultCount,
  totalCount,
  noun,
  hasActiveFilters,
  disabled = false,
  className,
}: ListFilterBarProps) {
  // `Input` isn't `forwardRef`-wrapped, so a ref placed directly on `InputGroupInput` never
  // attaches — the same reason `InputGroupAddon` (components/ui/input-group.tsx) reaches its
  // input via `querySelector` instead of a ref. Follow that same pattern here.
  const groupRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/') return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      event.preventDefault()
      groupRef.current?.querySelector('input')?.focus()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={cn('space-y-3 rounded-lg border bg-card p-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div ref={groupRef} className="sm:max-w-sm">
          <InputGroup>
            <InputGroupAddon>
              <Search className="h-4 w-4" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder={searchPlaceholder}
              value={searchValue}
              disabled={disabled}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && searchValue) {
                  event.stopPropagation()
                  onSearchChange('')
                }
              }}
            />
          </InputGroup>
        </div>
        {children ? (
          <div className="flex flex-1 flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:pb-0">
            {children}
          </div>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
          <span className="text-muted-foreground" aria-live="polite">
            {resultCount} of {totalCount} {noun}
            {totalCount === 1 ? '' : 's'}
          </span>
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 pr-1">
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="rounded-full p-0.5 hover:bg-secondary/60"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={onClearAll} className="ml-auto h-7 text-xs">
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )
}
