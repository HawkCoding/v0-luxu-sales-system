"use client"

import { useEffect } from "react"
import { reportClientError } from "@/lib/report-client-error"

/**
 * Last-resort boundary for render crashes that no segment error boundary
 * catches. It replaces the root layout, so it renders its own <html>/<body>
 * and cannot rely on app styles or providers — inline styles only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#52525b", marginBottom: "1.5rem" }}>
            The page stopped responding and the error has been logged. Your work up to
            this point was saved.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                borderRadius: "0.375rem",
                border: "none",
                background: "#18181b",
                color: "#fff",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                cursor: "pointer",
                borderRadius: "0.375rem",
                border: "1px solid #d4d4d8",
                background: "#fff",
                color: "#18181b",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
