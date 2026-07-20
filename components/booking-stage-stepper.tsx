"use client"

import { Check, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCanonicalPipelineStage, PIPELINE_STAGES, type PipelineStage } from "@/lib/types"

interface BookingStageStepperProps {
  currentStage: PipelineStage
  className?: string
}

// Forward-flow stages only; "lost" is a side branch and not part of the
// linear progression.
const FORWARD_STAGES = PIPELINE_STAGES.filter((stage) => stage.key !== "lost")

export function BookingStageStepper({ currentStage, className }: BookingStageStepperProps) {
  const canonical = getCanonicalPipelineStage(currentStage)
  const currentIndex = FORWARD_STAGES.findIndex((stage) => stage.key === canonical)
  const isLost = currentStage === "lost"

  return (
    <nav
      aria-label="Booking lifecycle progress"
      className={cn("flex items-center gap-0 overflow-x-auto pb-1", className)}
    >
      {FORWARD_STAGES.map((stage, index) => {
        // A stage label names a milestone that is already achieved once the job
        // reaches it, so the current stage counts as done. Only two states:
        // done (green tick) and not done (empty).
        const isDone = !isLost && index <= currentIndex
        const isCurrent = !isLost && index === currentIndex
        const isUpcoming = !isDone
        const isLast = index === FORWARD_STAGES.length - 1

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className="flex flex-col items-center gap-1"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors",
                  isDone && "border-success bg-success text-white",
                  isUpcoming && "border-muted-foreground/30 bg-card text-muted-foreground/50",
                )}
                title={stage.label}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Circle className="h-2 w-2 fill-current opacity-60" aria-hidden="true" />
                )}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-medium",
                  isDone ? "text-foreground" : "text-muted-foreground",
                )}
                style={{ fontFamily: "var(--font-inter)" }}
              >
                {stage.label}
              </span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "mx-2 h-px w-8 transition-colors",
                  isDone ? "bg-success" : "bg-muted-foreground/20",
                )}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
