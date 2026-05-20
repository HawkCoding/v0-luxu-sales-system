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
        const isCompleted = !isLost && index < currentIndex
        const isCurrent = !isLost && index === currentIndex
        const isUpcoming = isLost || index > currentIndex
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
                  isCompleted && "border-success bg-success text-white",
                  isCurrent && "border-accent bg-card text-accent ring-2 ring-accent/30",
                  isUpcoming && "border-muted-foreground/30 bg-card text-muted-foreground/50",
                )}
                title={stage.label}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Circle
                    className={cn("h-2 w-2 fill-current", isUpcoming && "opacity-60")}
                    aria-hidden="true"
                  />
                )}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[10px] font-medium",
                  isCompleted && "text-foreground",
                  isCurrent && "text-accent",
                  isUpcoming && "text-muted-foreground",
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
                  isCompleted ? "bg-success" : "bg-muted-foreground/20",
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
