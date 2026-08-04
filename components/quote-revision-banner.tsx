"use client"

import { Check, Circle, FileText } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface RevisionStep {
  /** Short imperative label, e.g. "Send the revised quote". */
  label: string
  done: boolean
  /** Rendered only while this is the first outstanding step. */
  action?: { label: string; onClick: () => void; disabled?: boolean }
}

interface QuoteRevisionBannerProps {
  steps: RevisionStep[]
}

/**
 * Shown while a quote revision is mid-flight. Revising rewinds the booking, so
 * the money-side actions (deposit invoice, pay in full) disappear until the
 * journey is re-walked — this spells out exactly what is left and drives the
 * next step, instead of leaving the salesperson to guess why a button vanished.
 */
export function QuoteRevisionBanner({ steps }: QuoteRevisionBannerProps) {
  const nextStepIndex = steps.findIndex((step) => !step.done)

  return (
    <Alert className="border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
      <FileText className="h-4 w-4" />
      <AlertTitle>Quote revised — finish the updated booking</AlertTitle>
      <AlertDescription>
        <p className="mb-2">
          Guest and reservation details were kept. Work through these steps to re-issue the invoice at the
          revised total.
        </p>
        <ol className="space-y-1.5">
          {steps.map((step, index) => (
            <li key={step.label} className="flex flex-wrap items-center gap-2 text-sm">
              {step.done ? (
                <Check aria-hidden className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <Circle aria-hidden className="h-4 w-4 shrink-0 opacity-40" />
              )}
              <span className={cn(step.done && "line-through opacity-70")}>
                <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                {index + 1}. {step.label}
              </span>
              {!step.done && index === nextStepIndex && step.action ? (
                <Button size="sm" onClick={step.action.onClick} disabled={step.action.disabled}>
                  {step.action.label}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </AlertDescription>
    </Alert>
  )
}
