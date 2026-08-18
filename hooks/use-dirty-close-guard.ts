"use client"

import { useState } from "react"

export interface UseDirtyCloseGuardOptions {
  /** True when the form holds something that would be lost by closing. */
  isDirty: boolean
  /** Runs once the close is actually confirmed -- either the form was clean, or the user chose
   *  "Discard" in the confirm dialog. Callers do their `reset()` / `setOpen(false)` here. */
  onConfirmedClose: () => void
}

export interface UseDirtyCloseGuardResult {
  /** Whether the "Discard your changes?" confirm should be shown. */
  confirming: boolean
  /** Spread onto `DialogContent`/`SheetContent`/etc. Radix already forwards these props through to
   *  the primitive on every shadcn wrapper in this repo, so no primitive needs changing. */
  contentProps: {
    onInteractOutside: (event: { preventDefault: () => void }) => void
    onPointerDownOutside: (event: { preventDefault: () => void }) => void
    onEscapeKeyDown: (event: { preventDefault: () => void }) => void
  }
  /** Pass as `onOpenChange` on the root Dialog/Sheet/AlertDialog. Routes the X button and any
   *  programmatic close through the same guard. */
  handleOpenChange: (open: boolean) => void
  confirmDiscard: () => void
  cancelDiscard: () => void
}

/**
 * Guards every dismissal path of a Dialog/Sheet/AlertDialog (backdrop click, Escape, the X button,
 * and any other `onOpenChange(false)`) behind a "Discard your changes?" confirm when the form is
 * dirty. A clean form still closes instantly on every path -- this only stands between a stray click
 * and unsaved typing, never between a stray click and an already-clean popup.
 */
export function useDirtyCloseGuard({
  isDirty,
  onConfirmedClose,
}: UseDirtyCloseGuardOptions): UseDirtyCloseGuardResult {
  const [confirming, setConfirming] = useState(false)

  function guard(event: { preventDefault: () => void }) {
    if (!isDirty) return
    event.preventDefault()
    setConfirming(true)
  }

  function handleOpenChange(open: boolean) {
    if (open) return
    if (!isDirty) {
      onConfirmedClose()
      return
    }
    setConfirming(true)
  }

  function confirmDiscard() {
    setConfirming(false)
    onConfirmedClose()
  }

  function cancelDiscard() {
    setConfirming(false)
  }

  return {
    confirming,
    contentProps: {
      onInteractOutside: guard,
      onPointerDownOutside: guard,
      onEscapeKeyDown: guard,
    },
    handleOpenChange,
    confirmDiscard,
    cancelDiscard,
  }
}
