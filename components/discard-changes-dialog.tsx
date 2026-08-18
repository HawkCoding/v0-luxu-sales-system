"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface DiscardChangesDialogProps {
  open: boolean
  onKeepEditing: () => void
  onDiscard: () => void
  description?: string
}

/**
 * The confirm shown by `useDirtyCloseGuard` before a dirty form is dismissed. Rendered as an
 * `AlertDialog` so it cannot itself be closed by the stray outside click or Escape press it exists to
 * guard against -- the only way out is one of its two buttons.
 */
export function DiscardChangesDialog({
  open,
  onKeepEditing,
  onDiscard,
  description = "Your work is saved as a draft and can be restored next time you open this.",
}: DiscardChangesDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeepEditing()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeepEditing}>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
