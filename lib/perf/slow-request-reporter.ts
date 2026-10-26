import { APP_VERSION } from "@/lib/version"

export const SLOW_REQUEST_MS = 3000
const MAX_REPORTS_PER_MINUTE = 10
const REPORT_ENDPOINT = "/api/client-perf"

interface NetworkInformationLike {
  effectiveType?: string
}

/** Drop UUIDs and the query string so the same endpoint groups together in the log. */
export function normalizeRequestPath(url: string): string {
  const path = url.split("?")[0] ?? url
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
}

export function shouldReport(durationMs: number, status: number): boolean {
  return durationMs >= SLOW_REQUEST_MS || status >= 500
}

function toApiPath(input: RequestInfo | URL): string | null {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  try {
    const parsed = new URL(raw, window.location.origin)
    if (parsed.origin !== window.location.origin) return null
    if (!parsed.pathname.startsWith("/api/")) return null
    if (parsed.pathname === REPORT_ENDPOINT || parsed.pathname === "/api/client-errors") return null
    return parsed.pathname
  } catch {
    return null
  }
}

/**
 * Wraps window.fetch once so slow or failing same-origin /api calls are recorded. Returns an
 * uninstall function. Never alters the response or throws on the caller's behalf.
 */
export function installSlowRequestReporter(): () => void {
  if (typeof window === "undefined") return () => {}

  const originalFetch = window.fetch
  let inFlight = 0
  let windowStart = Date.now()
  let sentInWindow = 0

  const report = (payload: Record<string, unknown>) => {
    const now = Date.now()
    if (now - windowStart > 60_000) {
      windowStart = now
      sentInWindow = 0
    }
    if (sentInWindow >= MAX_REPORTS_PER_MINUTE) return
    sentInWindow += 1

    try {
      void originalFetch
        .call(window, REPORT_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        })
        .catch(() => {})
    } catch {
      // Reporting is best-effort.
    }
  }

  const wrapped: typeof window.fetch = async (input, init) => {
    const path = toApiPath(input)
    if (!path) return originalFetch.call(window, input, init)

    const startedInFlight = inFlight
    const started = performance.now()
    inFlight += 1
    try {
      const response = await originalFetch.call(window, input, init)
      const durationMs = Math.round(performance.now() - started)
      if (shouldReport(durationMs, response.status)) {
        report({
          path: normalizeRequestPath(path),
          method: (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase(),
          status: response.status,
          durationMs,
          inFlight: startedInFlight,
          page: normalizeRequestPath(window.location.pathname),
          vercelId: response.headers.get("x-vercel-id") ?? undefined,
          connection: (navigator as Navigator & { connection?: NetworkInformationLike }).connection
            ?.effectiveType,
          appVersion: APP_VERSION,
        })
      }
      return response
    } finally {
      inFlight -= 1
    }
  }

  window.fetch = wrapped
  return () => {
    if (window.fetch === wrapped) window.fetch = originalFetch
  }
}
