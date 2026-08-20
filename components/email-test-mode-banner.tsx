"use client"

import { FlaskConical } from "lucide-react"
import useSWR from "swr"

interface EmailTestModeResponse {
  enabled?: boolean
  recipients?: string[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

/**
 * Always-visible reminder that outbound email is being diverted. Polls so the
 * banner disappears within a minute of test mode being switched off, without
 * every user having to reload.
 */
export function EmailTestModeBanner() {
  const { data } = useSWR<EmailTestModeResponse>("/api/settings/email-test-mode", fetcher, {
    refreshInterval: 60_000,
  })

  if (!data?.enabled) return null

  const recipients = data.recipients ?? []

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-b border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:text-amber-200"
    >
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        Email test mode is on — no email reaches customers.
      </span>
      {recipients.length > 0 && (
        <span className="font-normal">
          Everything is delivered to {recipients.join(", ")} instead.
        </span>
      )}
    </div>
  )
}
