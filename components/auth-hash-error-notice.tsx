"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/**
 * Supabase reports failed magic/recovery links in the URL *fragment*, which
 * never reaches the server — so a dead link used to land on the dashboard with
 * no explanation at all (QA 02, F02-4).
 *
 * This reads the fragment once on mount, shows a mapped message and strips it
 * so a refresh does not re-fire the toast. The raw `error_description` is never
 * rendered.
 */

const HASH_ERROR_MESSAGES: Record<string, string> = {
  otp_expired:
    "That link has already been used or has expired. Request a new password reset link.",
  access_denied: "That link is no longer valid. Request a new one.",
}

const FALLBACK_HASH_ERROR_MESSAGE =
  "That sign-in link could not be used. Request a new one."

export function getHashErrorMessage(hash: string): string | null {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash
  if (!normalized) return null

  const params = new URLSearchParams(normalized)
  const errorCode = params.get("error_code")
  const error = params.get("error")
  if (!errorCode && !error) return null

  return (
    (errorCode ? HASH_ERROR_MESSAGES[errorCode] : undefined) ??
    (error ? HASH_ERROR_MESSAGES[error] : undefined) ??
    FALLBACK_HASH_ERROR_MESSAGE
  )
}

export function AuthHashErrorNotice() {
  useEffect(() => {
    const message = getHashErrorMessage(window.location.hash)
    if (!message) return

    toast.error(message)
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`
    )
  }, [])

  return null
}
