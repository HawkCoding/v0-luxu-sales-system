"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, Plus, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface VariantOption {
  id: string
  name: string
}

export interface VariantChipPickerProps {
  label: string
  available: VariantOption[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  onCreate?: (name: string) => Promise<VariantOption> | VariantOption
  emptyText?: string
  disabled?: boolean
  className?: string
}

const VISIBLE_CHIP_LIMIT = 3

export function VariantChipPicker({
  label,
  available,
  selectedIds,
  onChange,
  onCreate,
  emptyText = "Select...",
  disabled,
  className,
}: VariantChipPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)

  const selectedOptions = useMemo(() => {
    const byId = new Map(available.map((option) => [option.id, option]))
    return selectedIds
      .map((id) => byId.get(id))
      .filter((option): option is VariantOption => Boolean(option))
  }, [available, selectedIds])

  const normalizedQuery = query.trim()
  const hasExactMatch = available.some(
    (option) => option.name.toLowerCase() === normalizedQuery.toLowerCase(),
  )

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((value) => value !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  function remove(id: string) {
    onChange(selectedIds.filter((value) => value !== id))
  }

  async function handleCreate() {
    if (!onCreate || !normalizedQuery || hasExactMatch || creating) return
    try {
      setCreating(true)
      const created = await onCreate(normalizedQuery)
      onChange([...selectedIds, created.id])
      setQuery("")
    } finally {
      setCreating(false)
    }
  }

  const visibleChips = selectedOptions.slice(0, VISIBLE_CHIP_LIMIT)
  const extraCount = selectedOptions.length - visibleChips.length
  const triggerLabelChips = visibleChips.length === 0 ? null : (
    <span className="flex flex-wrap items-center gap-1">
      {visibleChips.map((option) => (
        <Badge key={option.id} variant="secondary" className="gap-1">
          {option.name}
        </Badge>
      ))}
      {extraCount > 0 ? (
        <Badge variant="outline">+{extraCount}</Badge>
      ) : null}
    </span>
  )

  return (
    <div className={cn("space-y-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="h-auto min-h-9 w-full justify-between gap-2 px-2 py-1 text-left"
            data-testid="variant-chip-picker-trigger"
          >
            {triggerLabelChips ?? (
              <span className="text-sm text-muted-foreground">{emptyText}</span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command shouldFilter>
            <CommandInput
              placeholder={`Search ${label.toLowerCase()}...`}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No matches.</CommandEmpty>
              {available.length > 0 ? (
                <CommandGroup>
                  {available.map((option) => {
                    const selected = selectedIds.includes(option.id)
                    return (
                      <CommandItem
                        key={option.id}
                        value={option.name}
                        onSelect={() => toggle(option.id)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {option.name}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ) : null}
              {onCreate && normalizedQuery && !hasExactMatch ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value={`__create__${normalizedQuery}`}
                      onSelect={handleCreate}
                      data-testid="variant-chip-picker-create"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {`Create "${normalizedQuery}"`}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge key={option.id} variant="secondary" className="gap-1 pr-1">
              {option.name}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => remove(option.id)}
                  className="rounded-full p-0.5 hover:bg-secondary/60"
                  aria-label={`Remove ${option.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}
