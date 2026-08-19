"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react"

interface RevisionResetPreview {
  summary: string[]
  farAlong?: boolean
}

interface ReviseQuoteDialogProps {
  quoteId: string
  quoteNumber: string
  onRevised: () => void
}

export function ReviseQuoteDialog({ quoteId, quoteNumber, onRevised }: ReviseQuoteDialogProps) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<RevisionResetPreview | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [revising, setRevising] = useState(false)
  const [farAlongConfirmed, setFarAlongConfirmed] = useState(false)

  async function loadPlan() {
    setLoadingPlan(true)
    setPlan(null)
    setFarAlongConfirmed(false)
    try {
      const response = await fetch(`/api/quotes/${quoteId}/revise`)
      const payload = (await response.json().catch(() => ({}))) as {
        plan?: RevisionResetPreview
        error?: string
      }
      if (!response.ok || !payload.plan) {
        throw new Error(payload.error ?? "Failed to load revision preview")
      }
      setPlan(payload.plan)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load revision preview")
      setOpen(false)
    } finally {
      setLoadingPlan(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) void loadPlan()
  }

  async function confirmRevise() {
    setRevising(true)
    try {
      const response = await fetch(`/api/quotes/${quoteId}/revise`, { method: "POST" })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        reset?: { voidedInvoiceCount: number }
      }
      if (!response.ok) throw new Error(payload.error ?? "Failed to revise quote")

      const voided = payload.reset?.voidedInvoiceCount ?? 0
      toast.success(
        voided > 0
          ? `Quote revision created. ${voided} invoice${voided === 1 ? "" : "s"} voided.`
          : "Quote revision created.",
      )
      setOpen(false)
      onRevised()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revise quote")
    } finally {
      setRevising(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Revise
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revise {quoteNumber}?</AlertDialogTitle>
          <AlertDialogDescription>
            A new draft quote is created from this one and the booking is rewound so the sales steps run
            again against the revised numbers.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {loadingPlan ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Checking what will reset…
          </p>
        ) : (
          plan && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {plan.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )
        )}

        {plan?.farAlong && (
          <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              This booking has payments recorded
            </p>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={farAlongConfirmed}
                onCheckedChange={(checked) => setFarAlongConfirmed(checked === true)}
                className="mt-0.5"
              />
              I understand this booking will move back to Enquiry, its invoice(s) will be voided, and the
              deposit will no longer be marked as paid — the payments stay on record and the balance is
              rebilled once the revised quote is accepted.
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={revising}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={revising || loadingPlan || !plan || (plan.farAlong && !farAlongConfirmed)}
            onClick={(event) => {
              event.preventDefault()
              void confirmRevise()
            }}
          >
            {revising && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Revise quote
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
