"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { reportClientError } from "@/lib/report-client-error"

/**
 * Segment boundary for the signed-in app. A render crash inside any /app page stops here instead of
 * falling through to `app/global-error.tsx`, which replaces the root layout and blanks the whole
 * shell -- navigation and the sidebar stay usable, so the user can move on rather than reload.
 */
export default function AppError({
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
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center gap-2 space-y-0">
          <AlertTriangle aria-hidden className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-base">This page stopped responding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The error has been logged. Nothing you saved was lost — try again, or move to another
            part of the app.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => reset()}>
              <RefreshCw aria-hidden className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Go to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
