"use client"

import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export interface LoadingStateProps {
  variant?: "page" | "inline" | "overlay"
  message?: string
  progress?: number
  className?: string
}

export function LoadingState({
  variant = "page",
  message = "Loading...",
  progress,
  className,
}: LoadingStateProps) {
  const showProgress = typeof progress === "number" && !Number.isNaN(progress)

  const body = (
    <div
      className={cn(
        variant === "inline" && "flex flex-row items-center gap-3",
        variant !== "inline" && "flex flex-col items-center gap-3 text-center",
      )}
    >
      {variant === "page" ? (
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 animate-pulse">
            <span className="text-xl font-bold text-primary">LT</span>
          </div>
          <Spinner className="size-8" aria-hidden="true" />
        </div>
      ) : (
        <Spinner className={variant === "overlay" ? "size-8" : "size-4"} aria-hidden="true" />
      )}
      <p className="text-sm text-muted-foreground">
        {message}
      </p>
      {showProgress ? (
        <div className={cn("w-full", variant === "overlay" && "max-w-xs", variant === "page" && "max-w-xs")}>
          <Progress value={Math.min(100, Math.max(0, progress))} />
        </div>
      ) : null}
    </div>
  )

  if (variant === "overlay") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn(
          "absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm",
          className,
        )}
      >
        <div className="flex max-w-sm flex-col items-center gap-2 px-4 py-6">{body}</div>
      </div>
    )
  }

  if (variant === "inline") {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className={cn(className)}>
        {body}
      </div>
    )
  }

  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn("flex flex-col items-center justify-center gap-3", className)}>
      {body}
    </div>
  )
}
