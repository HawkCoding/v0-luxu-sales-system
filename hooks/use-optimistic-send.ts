"use client"

import { useCallback } from "react"
import { toast } from "sonner"

const DEFAULT_DELAY_MS = 5_000

export interface OptimisticSendOptions<T> {
  pendingLabel: string
  successLabel: string
  cancelledLabel?: string
  failureLabel?: string
  delayMs?: number
  perform: () => Promise<T>
}

export type OptimisticSendResult<T> =
  | { ok: true; data: T }
  | { ok: false; cancelled: true; error?: undefined }
  | { ok: false; cancelled?: false; error: Error }

/**
 * Gmail-style delayed-send wrapper.
 *
 * Shows a toast with an Undo action for `delayMs`. If the user clicks Undo
 * before the timer fires, `perform` is never called. Otherwise `perform`
 * runs and the result (success / failure) replaces the toast.
 *
 * Callers should treat `result.ok === false && cancelled` as a no-op (user
 * changed their mind) and only mutate parent state when `result.ok === true`.
 */
export function useOptimisticSend() {
  return useCallback(<T>(opts: OptimisticSendOptions<T>): Promise<OptimisticSendResult<T>> => {
    const delay = opts.delayMs ?? DEFAULT_DELAY_MS
    return new Promise<OptimisticSendResult<T>>((resolve) => {
      let cancelled = false

      const timer = setTimeout(() => {
        if (cancelled) return
        toast.dismiss(toastId)
        opts.perform().then(
          (data) => {
            toast.success(opts.successLabel)
            resolve({ ok: true, data })
          },
          (rawError) => {
            const error = rawError instanceof Error ? rawError : new Error(String(rawError))
            toast.error(opts.failureLabel ?? error.message ?? "Send failed")
            resolve({ ok: false, error })
          },
        )
      }, delay)

      const toastId = toast(opts.pendingLabel, {
        duration: delay,
        action: {
          label: "Undo",
          onClick: () => {
            cancelled = true
            clearTimeout(timer)
            toast.message(opts.cancelledLabel ?? "Send cancelled")
            resolve({ ok: false, cancelled: true })
          },
        },
      })
    })
  }, [])
}
