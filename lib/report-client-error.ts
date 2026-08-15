import { APP_VERSION } from "@/lib/version"

export interface ClientErrorReport {
  message: string
  stack?: string
  url?: string
  componentStack?: string
  digest?: string
  appVersion?: string
}

/**
 * Post a browser-side crash to the error log. Shared by every error boundary so a stack is always
 * accompanied by the build that produced it -- prod chunk names rotate on each deploy, and a stack
 * without its `appVersion` cannot be traced back to source.
 *
 * Never throws: reporting must not mask the error the user is already looking at.
 */
export function reportClientError(
  error: Error & { digest?: string },
  extra: { componentStack?: string } = {},
): void {
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Unhandled render error",
        stack: error.stack,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        componentStack: extra.componentStack,
        digest: error.digest,
        appVersion: APP_VERSION,
      } satisfies ClientErrorReport),
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Serializing or dispatching the report failed -- nothing useful left to do.
  }
}
