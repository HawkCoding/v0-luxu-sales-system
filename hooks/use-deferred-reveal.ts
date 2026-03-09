"use client"

import { useEffect, useState } from "react"

interface UseDeferredRevealOptions {
  isReady: boolean
  resetKey: string
  minDelayMs?: number
}

export function useDeferredReveal({
  isReady,
  resetKey,
  minDelayMs = 800,
}: UseDeferredRevealOptions) {
  const [delayElapsed, setDelayElapsed] = useState(isReady)

  useEffect(() => {
    if (isReady) {
      setDelayElapsed(true)
      return
    }

    setDelayElapsed(false)

    const timer = window.setTimeout(() => {
      setDelayElapsed(true)
    }, minDelayMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [minDelayMs, resetKey])

  return {
    showContent: isReady && delayElapsed,
  }
}
