"use client"

import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export interface ProgressDialogProps {
  open: boolean
  title: string
  description?: string
  progress: number
  currentMessage: string
  completedMessages?: string[]
  errorMessage?: string | null
  onDismiss?: () => void
  onRetry?: () => void
}

export function ProgressDialog({
  open,
  title,
  description,
  progress,
  currentMessage,
  completedMessages = [],
  errorMessage,
  onDismiss,
  onRetry,
}: ProgressDialogProps) {
  const hasError = Boolean(errorMessage)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && hasError) {
        onDismiss?.()
      }
    }}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={hasError}
        onEscapeKeyDown={(event) => {
          if (!hasError) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (!hasError) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div
          role="status"
          aria-live="polite"
          aria-busy={!hasError}
          className="space-y-5 py-2"
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                hasError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
              )}
            >
              {hasError ? (
                <AlertCircle className="size-5" aria-hidden="true" />
              ) : (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {hasError ? "Could not create enquiry" : currentMessage}
              </p>
              <p className="text-xs text-muted-foreground">
                {hasError ? errorMessage : "Please keep this window open while the job is prepared."}
              </p>
            </div>
          </div>

          {!hasError ? (
            <div className="space-y-2">
              <Progress value={Math.min(100, Math.max(0, progress))} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Preparing job</span>
                <span>{Math.round(Math.min(100, Math.max(0, progress)))}%</span>
              </div>
            </div>
          ) : null}

          {!hasError && completedMessages.length > 0 ? (
            <div className="space-y-1 border-t pt-3">
              {completedMessages.slice(-4).map((message) => (
                <p key={message} className="text-xs text-muted-foreground">
                  {message}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        {hasError ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
            <Button size="sm" onClick={onRetry}>
              Back to Review
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
