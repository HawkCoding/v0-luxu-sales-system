"use client"

import { useEffect, useRef } from "react"
import useSWR from "swr"
import { Paperclip } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { LibraryAttachmentOption } from "@/lib/attachments/email-attachment-library"

interface EmailAttachmentPickerProps {
  bookingId: string
  /** Correspondence kind of the email being sent (quote, invoice, ...). */
  kind: string
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  disabled?: boolean
}

async function fetchOptions(url: string): Promise<{ attachments: LibraryAttachmentOption[] }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Failed to load attachment options")
  return (await response.json()) as { attachments: LibraryAttachmentOption[] }
}

/**
 * Checkbox list of library files (uploaded in Settings → Email Attachments)
 * for the booking's train. Files configured for this email kind arrive
 * pre-ticked; the salesperson can tick or untick any before sending.
 */
export function EmailAttachmentPicker({
  bookingId,
  kind,
  selected,
  onSelectedChange,
  disabled,
}: EmailAttachmentPickerProps) {
  const { data } = useSWR(
    `/api/settings/email-attachments?bookingId=${bookingId}&kind=${encodeURIComponent(kind)}`,
    fetchOptions,
    { revalidateOnFocus: false },
  )

  // Pre-select defaults once per load; after that the user's choices win.
  const initialisedRef = useRef(false)
  useEffect(() => {
    if (initialisedRef.current || !data) return
    initialisedRef.current = true
    const defaults = data.attachments
      .filter((option) => option.defaultSelected)
      .map((option) => option.id)
    if (defaults.length > 0) onSelectedChange(defaults)
  }, [data, onSelectedChange])

  const options = data?.attachments ?? []
  if (options.length === 0) return null

  function toggle(id: string, checked: boolean) {
    onSelectedChange(checked ? [...selected, id] : selected.filter((value) => value !== id))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Attach files
      </span>
      <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
        {options.map((option) => (
          <div key={option.id} className="flex items-center gap-2">
            <Checkbox
              id={`library-attachment-${option.id}`}
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) => toggle(option.id, checked === true)}
              disabled={disabled}
            />
            <Label
              htmlFor={`library-attachment-${option.id}`}
              className="flex cursor-pointer items-center gap-1.5 text-sm font-normal"
            >
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              {option.name}
              {option.routeName ?? option.supplierName ? (
                <span className="text-xs text-muted-foreground">
                  ({option.routeName ?? option.supplierName})
                </span>
              ) : null}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )
}
