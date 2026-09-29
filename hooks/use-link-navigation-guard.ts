"use client"

import { useEffect, useRef } from "react"

/**
 * Intercepts in-app link clicks (sidebar, breadcrumbs, `next/link`) while `isDirty` is true and
 * hands the destination to `onBlocked` instead of navigating — the caller shows its own
 * "Discard your changes?" confirm and calls `router.push(href)` on discard. `beforeunload`
 * (useUnloadGuard) only covers full-page loads; client-side App Router navigation never fires it.
 *
 * Runs in the capture phase on `document`, ahead of React's root listener, so a blocked click
 * never reaches the Link's own onClick. Leaves alone anything the browser handles itself: new-tab
 * / modified clicks, `target`/`download` links, other origins, and same-page hash links.
 */
export function useLinkNavigationGuard(isDirty: boolean, onBlocked: (href: string) => void): void {
  const onBlockedRef = useRef(onBlocked)
  useEffect(() => {
    onBlockedRef.current = onBlocked
  }, [onBlocked])

  useEffect(() => {
    if (!isDirty) return
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const current = window.location
      if (url.pathname === current.pathname && url.search === current.search) return

      event.preventDefault()
      event.stopPropagation()
      onBlockedRef.current(`${url.pathname}${url.search}${url.hash}`)
    }
    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [isDirty])
}
