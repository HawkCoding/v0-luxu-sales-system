'use client'

import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface FacetedFilterOption {
  value: string
  label: string
  /** Optional row count shown right-aligned, so a value's yield is visible before clicking it. */
  count?: number
}

interface FacetedFilterProps {
  label: string
  options: FacetedFilterOption[]
  /** Undefined means "no filter" — every list page's "All ..." state. */
  value: string | undefined
  onChange: (value: string | undefined) => void
  className?: string
  disabled?: boolean
  /** Type-ahead search auto-enables once options exceed this count. */
  searchThreshold?: number
}

/**
 * Single-select facet popover — the shared replacement for the plain `Select` used on every
 * list filter bar (customers/bookings/documents supplier & consultant dropdowns). Adds
 * type-ahead for long lists (suppliers routinely run past a screenful) and an optional per-
 * option result count.
 */
export function FacetedFilter({
  label,
  options,
  value,
  onChange,
  className,
  disabled,
  searchThreshold = 8,
}: FacetedFilterProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)
  const showSearch = options.length > searchThreshold

  function select(nextValue: string) {
    onChange(nextValue === value ? undefined : nextValue)
    setOpen(false)
  }

  function clear() {
    onChange(undefined)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'h-9 justify-between gap-2 font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">
            {selected ? (
              <>
                <span className="text-muted-foreground">{label}:</span> {selected.label}
              </>
            ) : (
              label
            )}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        <Command>
          {showSearch ? <CommandInput placeholder={`Search ${label.toLowerCase()}...`} /> : null}
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => select(option.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      option.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.count !== undefined ? (
                    <span className="text-xs text-muted-foreground">{option.count}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {selected ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem value="__clear__" onSelect={clear}>
                    Clear
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
