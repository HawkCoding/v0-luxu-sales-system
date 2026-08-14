"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BufferedInput } from "@/components/ui/buffered-input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SortableList } from "@/components/ui/sortable-list"
import { useRole } from "@/lib/role-context"
import { type SupplierEmailLabel, useSupplierEmailLabels } from "@/lib/use-data"
import { cn } from "@/lib/utils"

export interface EditableSupplierEmail {
  id: string
  email: string
  label: string
}

export const SUPPLIER_EMAIL_LABEL_SUGGESTIONS = [
  "General",
  "Reservations",
  "Accounts",
  "Management",
  "Operations",
] as const

const REMOVE_ICON_BUTTON_CLASS =
  "border-muted-foreground/25 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
const EMAIL_LABEL_MAX_LENGTH = 100
const CUSTOM_LABEL_SORT_ORDER = 999

export function createEmptySupplierEmail(): EditableSupplierEmail {
  return {
    id: crypto.randomUUID(),
    email: "",
    label: "General",
  }
}

function splitEmailCandidates(value: string): string[] {
  return value
    .split(/[,\n;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

interface SupplierEmailEditorProps {
  emails: EditableSupplierEmail[]
  onChange: (next: EditableSupplierEmail[]) => void
  idPrefix: string
  /** Read-only mode: the list is shown but cannot be edited, reordered or added to. Used when a
   * supplier inherits its contacts from a linked sibling record. */
  disabled?: boolean
}

export function SupplierEmailEditor({
  emails,
  onChange,
  idPrefix,
  disabled = false,
}: SupplierEmailEditorProps) {
  const { can } = useRole()
  const canManageLabels = can("edit:suppliers")
  const { data: persistedLabelOptions, mutate: mutateLabelOptions } = useSupplierEmailLabels()
  const [openLabelRowId, setOpenLabelRowId] = useState<string | null>(null)
  const [labelSearchValue, setLabelSearchValue] = useState("")
  const [activeLabelValue, setActiveLabelValue] = useState("")
  const [isCreatingLabel, setIsCreatingLabel] = useState(false)
  const [deletingLabelIds, setDeletingLabelIds] = useState<Set<string>>(new Set())

  const defaultLabelOptions: SupplierEmailLabel[] = SUPPLIER_EMAIL_LABEL_SUGGESTIONS.map(
    (name, index) => ({
      id: `fallback-${name.toLowerCase()}`,
      name,
      sortOrder: index,
    }),
  )

  const labelOptionMap = new Map<string, SupplierEmailLabel>()

  for (const option of persistedLabelOptions ?? defaultLabelOptions) {
    labelOptionMap.set(option.name.trim().toLowerCase(), option)
  }

  for (const email of emails) {
    const normalizedName = email.label.trim()
    const normalizedKey = normalizedName.toLowerCase()
    if (!normalizedName || labelOptionMap.has(normalizedKey)) {
      continue
    }
    labelOptionMap.set(normalizedKey, {
      id: `derived-${normalizedKey}`,
      name: normalizedName,
      sortOrder: CUSTOM_LABEL_SORT_ORDER,
    })
  }

  const labelOptions = Array.from(labelOptionMap.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder
    }
    return a.name.localeCompare(b.name)
  })

  const addEmail = () => {
    onChange([...emails, createEmptySupplierEmail()])
  }

  const reorderEmails = (orderedIds: string[]) => {
    const byId = new Map(emails.map((entry) => [entry.id, entry]))
    const reordered = orderedIds.flatMap((id) => {
      const entry = byId.get(id)
      return entry ? [entry] : []
    })
    // Anything the drag list didn't name (shouldn't happen) keeps its place at the end rather than
    // being dropped from the supplier.
    const missing = emails.filter((entry) => !orderedIds.includes(entry.id))
    onChange([...reordered, ...missing])
  }

  const getActiveLabelValue = (label: string) => {
    const normalizedLabel = label.trim() || "General"
    const matchingOption = labelOptions.find(
      (option) => option.name.toLowerCase() === normalizedLabel.toLowerCase(),
    )
    return matchingOption?.name ?? normalizedLabel
  }

  const removeEmail = (emailIndex: number) => {
    onChange(emails.filter((_, index) => index !== emailIndex))
  }

  const updateEmailLabel = (emailIndex: number, value: string) => {
    const normalizedLabel = value.trim().slice(0, EMAIL_LABEL_MAX_LENGTH) || "General"
    onChange(
      emails.map((entry, index) =>
        index === emailIndex ? { ...entry, label: normalizedLabel } : entry,
      ),
    )
  }

  const updateEmailValue = (emailIndex: number, value: string) => {
    if (!/[,\n;]/.test(value)) {
      onChange(
        emails.map((entry, index) =>
          index === emailIndex ? { ...entry, email: value } : entry,
        ),
      )
      return
    }

    const splitCandidates = splitEmailCandidates(value)
    if (splitCandidates.length === 0) {
      onChange(
        emails.map((entry, index) =>
          index === emailIndex ? { ...entry, email: "" } : entry,
        ),
      )
      return
    }

    const sourceRow = emails[emailIndex]
    const firstValue = splitCandidates[0]
    const extraRows = splitCandidates.slice(1).map((candidate) => ({
      id: crypto.randomUUID(),
      email: candidate,
      label: sourceRow?.label?.trim() || "General",
    }))

    const next = emails.flatMap((entry, index) => {
      if (index !== emailIndex) {
        return [entry]
      }
      return [{ ...entry, email: firstValue }, ...extraRows]
    })
    onChange(next)
  }

  const commitLabelSelection = (emailIndex: number, value: string) => {
    updateEmailLabel(emailIndex, value)
    setOpenLabelRowId(null)
    setLabelSearchValue("")
  }

  const createCustomLabel = async (labelName: string) => {
    const normalizedName = labelName.trim().slice(0, EMAIL_LABEL_MAX_LENGTH)
    if (!normalizedName || !canManageLabels) {
      return
    }

    const hasPersistedMatch = (persistedLabelOptions ?? []).some(
      (option) => option.name.toLowerCase() === normalizedName.toLowerCase(),
    )
    if (hasPersistedMatch) {
      return
    }

    const optimisticId = `optimistic-${normalizedName.toLowerCase()}`
    const optimisticOption: SupplierEmailLabel = {
      id: optimisticId,
      name: normalizedName,
      sortOrder: CUSTOM_LABEL_SORT_ORDER,
    }
    const previousOptions = persistedLabelOptions ?? []

    setIsCreatingLabel(true)
    await mutateLabelOptions([...previousOptions, optimisticOption], false)

    try {
      const response = await fetch("/api/supplier-email-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName }),
      })

      if (!response.ok) {
        await mutateLabelOptions(previousOptions, false)
        return
      }

      const createdOption = (await response.json()) as SupplierEmailLabel
      const withoutOptimistic = (persistedLabelOptions ?? previousOptions).filter(
        (option) => option.id !== optimisticId,
      )
      await mutateLabelOptions([...withoutOptimistic, createdOption], false)
      await mutateLabelOptions()
    } catch {
      await mutateLabelOptions(previousOptions, false)
    } finally {
      setIsCreatingLabel(false)
    }
  }

  const removeLabelOption = async (labelId: string) => {
    if (!canManageLabels) {
      return
    }

    const previousOptions = persistedLabelOptions ?? []
    const nextDeletingIds = new Set(deletingLabelIds)
    nextDeletingIds.add(labelId)
    setDeletingLabelIds(nextDeletingIds)

    await mutateLabelOptions(
      previousOptions.filter((option) => option.id !== labelId),
      false,
    )

    try {
      const response = await fetch("/api/supplier-email-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: labelId }),
      })

      if (!response.ok) {
        await mutateLabelOptions(previousOptions, false)
      } else {
        await mutateLabelOptions()
      }
    } catch {
      await mutateLabelOptions(previousOptions, false)
    } finally {
      setDeletingLabelIds((current) => {
        const next = new Set(current)
        next.delete(labelId)
        return next
      })
    }
  }

  return (
    <div className="space-y-3">
      <Label>Supplier emails</Label>

      {emails.length > 0 ? (
        <div className="space-y-2">
          <div className="hidden items-center gap-3 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[28px_170px_1fr_auto]">
            <span className="sr-only">Reorder</span>
            <span>Label</span>
            <span>Email address</span>
            <span className="sr-only">Actions</span>
          </div>

          <SortableList
            items={emails}
            onReorder={reorderEmails}
            disabled={disabled}
            renderItem={({ item: entry, index, dragHandle }) => {
            const isLabelPopoverOpen = openLabelRowId === entry.id
            const normalizedSearchValue = labelSearchValue.trim()
            const showCustomLabelOption =
              normalizedSearchValue.length > 0 &&
              !labelOptions.some((option) => option.name.toLowerCase() === normalizedSearchValue.toLowerCase())

            return (
              <div
                className="grid items-end gap-3 md:grid-cols-[28px_170px_1fr_auto]"
              >
                <div className="flex items-center pb-1">{dragHandle}</div>

                <div className="space-y-2">
                  <Label className="md:sr-only">Label</Label>
                  <Popover
                    open={isLabelPopoverOpen}
                    onOpenChange={(isOpen) => {
                      if (isOpen) {
                        setOpenLabelRowId(entry.id)
                        setLabelSearchValue("")
                        setActiveLabelValue(getActiveLabelValue(entry.label))
                        return
                      }
                      setOpenLabelRowId(null)
                      setLabelSearchValue("")
                      setActiveLabelValue("")
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        id={`${idPrefix}-label-${entry.id}`}
                        variant="outline"
                        role="combobox"
                        aria-expanded={isLabelPopoverOpen}
                        disabled={disabled}
                        className="w-full justify-between font-normal"
                      >
                        <span className="truncate text-left">
                          {entry.label.trim() || "General"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[220px] p-0">
                      <Command value={activeLabelValue} onValueChange={setActiveLabelValue}>
                        <CommandInput
                          value={labelSearchValue}
                          onValueChange={setLabelSearchValue}
                          placeholder="Search or type label..."
                        />
                        <CommandList>
                          <CommandEmpty>No labels found.</CommandEmpty>
                          <CommandGroup>
                            {labelOptions.map((labelOption) => {
                              const isPersistedLabel = (persistedLabelOptions ?? []).some(
                                (persistedOption) => persistedOption.id === labelOption.id,
                              )
                              const isRemovingLabel = deletingLabelIds.has(labelOption.id)

                              return (
                                <CommandItem
                                  key={labelOption.id}
                                  value={labelOption.name}
                                  onSelect={() => commitLabelSelection(index, labelOption.name)}
                                >
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      entry.label.trim().toLowerCase() ===
                                        labelOption.name.toLowerCase()
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  <span className="flex-1 truncate">{labelOption.name}</span>
                                  {canManageLabels && isPersistedLabel ? (
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:text-destructive"
                                      aria-label={`Remove ${labelOption.name} label`}
                                      disabled={isRemovingLabel}
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                      }}
                                      onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        void removeLabelOption(labelOption.id)
                                      }}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </CommandItem>
                              )
                            })}
                            {showCustomLabelOption && canManageLabels ? (
                              <CommandItem
                                value={`Use ${normalizedSearchValue}`}
                                onSelect={async () => {
                                  commitLabelSelection(index, normalizedSearchValue)
                                  await createCustomLabel(normalizedSearchValue)
                                }}
                                disabled={isCreatingLabel}
                              >
                                <Plus className="h-4 w-4" />
                                Use "{normalizedSearchValue}"
                              </CommandItem>
                            ) : null}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${idPrefix}-email-${entry.id}`} className="md:sr-only">
                    Email address
                  </Label>
                  <BufferedInput
                    id={`${idPrefix}-email-${entry.id}`}
                    type="email"
                    value={entry.email}
                    onValueChange={(value) => updateEmailValue(index, value)}
                    placeholder="supplier@example.com"
                    disabled={disabled}
                  />
                </div>

                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={REMOVE_ICON_BUTTON_CLASS}
                  aria-label="Remove email"
                  disabled={disabled}
                  onClick={() => removeEmail(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
            }}
          />

          <p className="px-1 text-xs text-muted-foreground">
            {disabled
              ? "The first address is the supplier's primary contact."
              : "Drag to reorder. The first address is the supplier's primary contact."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No emails added yet.
        </div>
      )}

      {disabled ? null : (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={addEmail}>
            <Plus className="mr-2 h-4 w-4" />
            Add email
          </Button>
        </div>
      )}
    </div>
  )
}
