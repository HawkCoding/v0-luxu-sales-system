"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

/**
 * Slim, dismissible "preview / in development" notice.
 *
 * Hidden by default; only shown where NEXT_PUBLIC_PREVIEW_BANNER === "true"
 * (e.g. the prospect demo portal). Dismissal is remembered per-browser.
 * Env values are trimmed so a stray BOM/newline can't break the === check.
 */
const SHOW_BANNER = process.env.NEXT_PUBLIC_PREVIEW_BANNER?.trim() === "true"
const BANNER_TEXT =
  process.env.NEXT_PUBLIC_PREVIEW_BANNER_TEXT?.trim() ||
  "Preview — in active development, sample data only."
const DISMISS_KEY = "ttt-preview-banner-dismissed"

export function PreviewBanner() {
  // Start visible to match SSR; hide after mount if previously dismissed.
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (SHOW_BANNER && localStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true)
    }
  }, [])

  if (!SHOW_BANNER || dismissed) return null

  return (
    <div
      role="status"
      className="relative flex items-center justify-center bg-amber-500 text-amber-950 text-[11px] leading-tight px-8 py-0.5 text-center"
    >
      <span>{BANNER_TEXT}</span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1")
          } catch {
            // ignore storage failures (private mode etc.)
          }
          setDismissed(true)
        }}
        aria-label="Dismiss preview notice"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-amber-600/30 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-900"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
