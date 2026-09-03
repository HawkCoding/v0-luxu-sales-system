"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Radix renders Select / Popover / Dialog content into a portal on `document.body`, so a click on a
 * dropdown item opened from inside the watched element is not a DOM descendant of it. Treating that
 * as "left the section" would fire a save mid-interaction, so portalled surfaces are ignored.
 */
const PORTAL_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-radix-portal]",
  "[role='listbox']",
  "[role='menu']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[data-sonner-toaster]",
].join(",")

function isInsideOrPortalled(target: EventTarget | null, element: HTMLElement): boolean {
  if (!(target instanceof Node)) return true
  if (element.contains(target)) return true
  const asElement = target instanceof Element ? target : target.parentElement
  return Boolean(asElement?.closest(PORTAL_SELECTOR))
}

/**
 * Calls `onExit` when the pointer or keyboard focus moves out of `ref` -- the "click out of the
 * section and it saves" behaviour. Only listens while `enabled` is true (i.e. while there is
 * something worth saving), so a clean form costs nothing.
 *
 * `pointerdown` is captured rather than `click` so the save is queued even when the click lands on
 * something that unmounts or re-renders before the click completes.
 */
export function useSaveOnExit(
  ref: RefObject<HTMLElement | null>,
  onExit: () => void,
  enabled: boolean,
): void {
  // Held in a ref so a handler that closes over changing state doesn't re-bind the listeners on
  // every keystroke.
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  useEffect(() => {
    if (!enabled) return
    function handle(event: Event) {
      const element = ref.current
      if (!element) return
      if (isInsideOrPortalled(event.target, element)) return
      onExitRef.current()
    }
    document.addEventListener("pointerdown", handle, true)
    document.addEventListener("focusin", handle, true)
    return () => {
      document.removeEventListener("pointerdown", handle, true)
      document.removeEventListener("focusin", handle, true)
    }
  }, [enabled, ref])
}
