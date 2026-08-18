"use client"

import { useEffect } from "react"

/**
 * Warns on browser refresh, tab close, or window close while `isDirty` is true -- covers the crash
 * path draft autosave can't fully protect against (the write is debounced, so the last second of
 * typing can still be in flight). Modern browsers ignore any custom message and show their own
 * generic "leave site?" prompt; setting `returnValue` is what triggers it.
 */
export function useUnloadGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [isDirty])
}
