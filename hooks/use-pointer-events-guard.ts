"use client"

import { useEffect } from "react"

/**
 * Radix modal layers set `body { pointer-events: none }` while open and restore
 * it on close. When one modal closes as another opens — or when a modal mounts
 * into a subtree that is re-rendering — that restore can be skipped, leaving the
 * whole page unclickable behind a grey overlay with no way out.
 *
 * These guards detect that state and clear it, and report otherwise-invisible
 * client errors so the next incident leaves a trace.
 */

/** Selector for any element that legitimately holds a pointer-events lock. */
const LAYER_SELECTOR =
  '[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"],[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[data-sonner-toast]'

/** Grace period before clearing, so a mounting dialog is never cut off. */
export const GUARD_DEBOUNCE_MS = 100

/**
 * Clears a stuck `pointer-events: none` on <body> when no modal layer is
 * mounted. Exported for testing.
 *
 * @returns true when a stuck lock was cleared.
 */
export function releaseStuckPointerEvents(doc: Document = document): boolean {
  if (doc.body.style.pointerEvents !== "none") return false
  if (doc.querySelector(LAYER_SELECTOR)) return false
  doc.body.style.removeProperty("pointer-events")
  return true
}

/**
 * Watches <body> for a pointer-events lock that outlives every modal layer and
 * releases it. Mount once, high in the authenticated app shell.
 */
export function usePointerEventsGuard(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (releaseStuckPointerEvents()) {
          console.warn("[pointer-events-guard] released a stuck body pointer-events lock")
        }
      }, GUARD_DEBOUNCE_MS)
    }

    // `style` catches the lock itself; childList/subtree catches the layer
    // unmounting after the lock was already set.
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    })
    schedule()

    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [])
}

const REPORT_THROTTLE_MS = 60_000

/**
 * Reports uncaught errors and unhandled rejections to /api/client-errors.
 * Throttled per error signature so a render loop cannot flood the table.
 * Exported for testing.
 */
export function createErrorReporter(now: () => number = Date.now) {
  const lastReported = new Map<string, number>()

  return function report(message: string, details: Record<string, unknown>): void {
    if (!message) return
    const previous = lastReported.get(message)
    const timestamp = now()
    if (previous !== undefined && timestamp - previous < REPORT_THROTTLE_MS) return
    lastReported.set(message, timestamp)

    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, ...details }),
      keepalive: true,
    }).catch(() => {
      // Reporting must never surface its own failure to the user.
    })
  }
}

/** Installs window-level error listeners that forward to /api/client-errors. */
export function useClientErrorReporter(): void {
  useEffect(() => {
    const report = createErrorReporter()

    const onError = (event: ErrorEvent) => {
      report(event.message || "Uncaught error", {
        stack: event.error instanceof Error ? event.error.stack : undefined,
        url: window.location.href,
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      report(
        reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection"),
        {
          stack: reason instanceof Error ? reason.stack : undefined,
          url: window.location.href,
        },
      )
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])
}
