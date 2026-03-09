"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ContentTransitionProps {
  show: boolean
  children: ReactNode
  fallback?: ReactNode
  className?: string
}

export function ContentTransition({
  show,
  children,
  fallback = null,
  className,
}: ContentTransitionProps) {
  if (!show) {
    return <>{fallback}</>
  }

  return (
    <div className={cn("animate-in fade-in-0 duration-1000", className)}>
      {children}
    </div>
  )
}
