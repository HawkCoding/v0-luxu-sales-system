"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-context"
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  getSessionTimeoutWarningMinutes,
  parseSessionTimeoutMinutes,
} from "@/lib/session-timeout"

interface SessionTimeoutResponse {
  sessionTimeoutMinutes?: number
  warningMinutes?: number
}

const fetcher = (url: string) => fetch(url).then((response) => response.json())
const MINUTE_MS = 60 * 1000
const ACTIVITY_THROTTLE_MS = 1000
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "pointerdown"] as const

export function SessionTimeoutGuard() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { data } = useSWR<SessionTimeoutResponse>(user ? "/api/settings/session-timeout" : null, fetcher)
  const [warningOpen, setWarningOpen] = useState(false)
  const warningTimerRef = useRef<number | null>(null)
  const logoutTimerRef = useRef<number | null>(null)
  const lastActivityResetRef = useRef(0)
  const warningOpenRef = useRef(false)
  const logoutRef = useRef(logout)

  useEffect(() => {
    logoutRef.current = logout
  }, [logout])

  useEffect(() => {
    warningOpenRef.current = warningOpen
  }, [warningOpen])

  const sessionTimeoutMinutes = parseSessionTimeoutMinutes(
    data?.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT_MINUTES,
  )
  const warningMinutes = useMemo(
    () => (
      typeof data?.warningMinutes === "number"
        ? data.warningMinutes
        : getSessionTimeoutWarningMinutes(sessionTimeoutMinutes)
    ),
    [data?.warningMinutes, sessionTimeoutMinutes],
  )

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }
  }, [])

  const performLogout = useCallback(() => {
    clearTimers()
    setWarningOpen(false)
    void logoutRef.current().finally(() => {
      window.location.replace("/login")
    })
  }, [clearTimers])

  const resetIdleTimer = useCallback(() => {
    if (!user) return

    clearTimers()
    setWarningOpen(false)

    const timeoutMs = sessionTimeoutMinutes * MINUTE_MS
    const warningMs = Math.min(warningMinutes * MINUTE_MS, Math.max(0, timeoutMs - MINUTE_MS))
    const warningDelayMs = Math.max(0, timeoutMs - warningMs)

    warningTimerRef.current = window.setTimeout(() => {
      setWarningOpen(true)
      logoutTimerRef.current = window.setTimeout(performLogout, warningMs)
    }, warningDelayMs)
  }, [clearTimers, performLogout, sessionTimeoutMinutes, user, warningMinutes])

  useEffect(() => {
    resetIdleTimer()
    return clearTimers
  }, [clearTimers, resetIdleTimer])

  useEffect(() => {
    if (!user || warningOpenRef.current) return
    resetIdleTimer()
  }, [pathname, resetIdleTimer, user])

  useEffect(() => {
    if (!user) return

    const handleActivity = () => {
      if (warningOpenRef.current) return
      const now = Date.now()
      if (now - lastActivityResetRef.current < ACTIVITY_THROTTLE_MS) return
      lastActivityResetRef.current = now
      resetIdleTimer()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleActivity()
      }
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity, { passive: true })
    })
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity)
      })
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [resetIdleTimer, user])

  const handleStaySignedIn = () => {
    resetIdleTimer()
  }

  if (!user) return null

  return (
    <Dialog open={warningOpen} onOpenChange={(open) => {
      if (!open) handleStaySignedIn()
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Session timeout warning</DialogTitle>
          <DialogDescription>
            You have been inactive. Stay signed in to keep working, or you will be logged out shortly.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={performLogout}>
            Log out now
          </Button>
          <Button type="button" onClick={handleStaySignedIn}>
            Stay signed in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
