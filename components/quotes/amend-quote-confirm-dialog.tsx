"use client"

import { useEffect, useId, useState } from "react"
import { Loader2, TriangleAlert } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AMEND_CONFIRM_MESSAGE, AMEND_NOTE_MAX_LENGTH, isVoucherSentOrLater } from "@/lib/quotes/amend-quote"
import { formatMoney } from "@/lib/money"
import type { ChangedExistingLine } from "@/lib/quotes/amend-pricing"

/** Keeps the confirmation short — the rest are summarised as "+N more". */
const MAX_CHANGED_LINES_SHOWN = 5

interface AmendQuoteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTotal: number
  /** What the total will be once saved — the server recomputes it the same way. */
  newTotal: number
  currency: string
  /** The booking's pipeline stage; a rise after the voucher went out is called out as money owed. */
  bookingStage?: string | null
  /** Existing lines whose unit price moved in the re-price — a supplier rate card edited since the
   *  quote was accepted (exchange rates are locked to the accepted quote's). */
  changedLines?: readonly ChangedExistingLine[]
  saving: boolean
  onConfirm: (note: string | undefined) => void
}

/**
 * The explicit sign-off before an accepted quote is changed in place. Nothing is emailed and the
 * booking is not rewound, so the salesperson is the one telling the client — this says so plainly.
 */
export function AmendQuoteConfirmDialog({
  open,
  onOpenChange,
  currentTotal,
  newTotal,
  currency,
  bookingStage = null,
  changedLines = [],
  saving,
  onConfirm,
}: AmendQuoteConfirmDialogProps) {
  const [note, setNote] = useState("")
  const noteId = useId()

  useEffect(() => {
    if (open) setNote("")
  }, [open])

  const difference = Math.round((newTotal - currentTotal) * 100) / 100

  return (
    <AlertDialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Amend the accepted quote?</AlertDialogTitle>
          <AlertDialogDescription className="flex items-start gap-2 text-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            <span>{AMEND_CONFIRM_MESSAGE}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border p-3 text-sm">
          <dt className="text-muted-foreground">Current total</dt>
          <dd className="text-right">{formatMoney(currentTotal, currency)}</dd>
          <dt className="text-muted-foreground">New total</dt>
          <dd className="text-right font-medium">{formatMoney(newTotal, currency)}</dd>
          <dt className="text-muted-foreground">Difference</dt>
          <dd className="text-right">
            {difference > 0 ? "+" : difference < 0 ? "−" : ""}
            {formatMoney(Math.abs(difference), currency)}
          </dd>
        </dl>

        {changedLines.length > 0 && (
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground">
            <p className="flex items-start gap-2 font-medium">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
              {changedLines.length === 1
                ? "1 existing item changed price:"
                : `${changedLines.length} existing items changed price:`}
            </p>
            <ul className="space-y-0.5 pl-5" aria-label="Existing items that changed price">
              {changedLines.slice(0, MAX_CHANGED_LINES_SHOWN).map((line, index) => (
                <li key={`${line.description}-${index}`}>
                  {line.description}: {formatMoney(line.before, currency)} → {formatMoney(line.after, currency)}
                </li>
              ))}
              {changedLines.length > MAX_CHANGED_LINES_SHOWN && (
                <li className="text-muted-foreground">+{changedLines.length - MAX_CHANGED_LINES_SHOWN} more</li>
              )}
            </ul>
          </div>
        )}

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            The booking keeps its stage, unless the new total changes whether it is paid in full.
            Payments, the deposit and the reservation form are kept.
          </li>
          <li>The deposit amount does not change. The balance due follows the new total.</li>
          <li>Documents show the change the next time they are generated. Nothing is sent.</li>
        </ul>

        {difference > 0 && isVoucherSentOrLater(bookingStage) && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
            <span>
              The voucher has already been sent. The extra {formatMoney(difference, currency)} becomes an
              outstanding balance the client still has to pay.
            </span>
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={noteId}>Note (optional)</Label>
          <Textarea
            id={noteId}
            value={note}
            maxLength={AMEND_NOTE_MAX_LENGTH}
            placeholder="e.g. Client asked for an extra night in Cape Town"
            onChange={(event) => setNote(event.target.value)}
            disabled={saving}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(event) => {
              // Kept open until the save settles — the parent closes it on success.
              event.preventDefault()
              const trimmed = note.trim()
              onConfirm(trimmed.length > 0 ? trimmed : undefined)
            }}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Confirm amendment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
