"use client"

import { useEffect } from "react"
import { getSupabase } from "@/lib/supabase/client"

const SKIP_PREFIXES = ["/api/auth/", "/api/logout"]

let refreshInFlight: Promise<boolean> | null = null

/** One shared refresh so parallel 401s don't burn the rotating refresh token twice. */
function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = getSupabase()
      .auth.refreshSession()
      .then(({ data, error }) => !error && Boolean(data.session))
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

function isInternalApiCall(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin !== window.location.origin) return false
    if (!parsed.pathname.startsWith("/api/")) return false
    return !SKIP_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix))
  } catch {
    return false
  }
}

/**
 * When an internal API call answers 401 (server cookie went stale while the page
 * stayed open), refresh the session once and replay the request. If the session
 * is truly gone, send the user to login instead of leaving buttons that fail
 * with "Unauthorized" until a manual reload.
 */
export function ApiSessionRecovery(): null {
  useEffect(() => {
    const originalFetch = window.fetch

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const retryable = request.clone()
      const response = await originalFetch(request)

      if (response.status !== 401 || !isInternalApiCall(request.url)) return response

      const refreshed = await refreshSessionOnce()
      if (refreshed) {
        const retry = await originalFetch(retryable)
        if (retry.status !== 401) return retry
      }

      window.location.replace("/login?error=session-ended")
      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
