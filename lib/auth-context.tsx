"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { getSupabase } from "@/lib/supabase/client"
import type { Role } from "./types"

export interface User {
  name: string
  email: string
  role: Role
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  loginWithPassword: (email: string, password: string) => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AUTH_INIT_TIMEOUT_MS = 4000
const STALE_REFRESH_TOKEN_MESSAGES = [
  "Invalid Refresh Token",
  "Refresh Token Not Found",
  "refresh_token_not_found",
]

type AuthTimeoutResult<T> =
  | { timedOut: false; value: T }
  | { timedOut: true }

async function withAuthTimeout<T>(operation: PromiseLike<T>): Promise<AuthTimeoutResult<T>> {
  let timeoutId: number | undefined

  try {
    return await Promise.race([
      Promise.resolve(operation).then((value) => ({ timedOut: false as const, value })),
      new Promise<AuthTimeoutResult<T>>((resolve) => {
        timeoutId = window.setTimeout(() => {
          resolve({ timedOut: true })
        }, AUTH_INIT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId)
    }
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
  initialUser?: User | null
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const initialUserRef = useRef<User | null>(initialUser)
  const [user, setUser] = useState<User | null>(initialUserRef.current)
  const [loading, setLoading] = useState(initialUserRef.current === null)
  const authHandlerInFlightRef = useRef(false)

  const loadProfile = useCallback(async (userId: string, fallbackEmail: string) => {
    const supabase = getSupabase()
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, surname, clearance_level, email")
      .eq("user_id", userId)
      .single()

    if (profile) {
      const displayName = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name
      setUser({
        name: displayName,
        email: profile.email || fallbackEmail,
        role: profile.clearance_level as Role,
      })
    } else {
      const emailName = fallbackEmail.split("@")[0]
      const displayName = emailName.charAt(0).toUpperCase() + emailName.slice(1)
      setUser({ name: displayName, email: fallbackEmail, role: "consultant" })
    }
  }, [])

  const isStaleRefreshTokenError = useCallback((error: unknown) => {
    if (!error) return false

    const errorMessage =
      typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error)

    return STALE_REFRESH_TOKEN_MESSAGES.some((message) =>
      errorMessage.includes(message)
    )
  }, [])

  const clearLocalSession = useCallback(async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut({ scope: "local" }).catch(() => {})
    setUser(null)
  }, [])

  useEffect(() => {
    let mounted = true
    let subscription: { unsubscribe: () => void } | undefined

    try {
      const supabase = getSupabase()

      const loadUserWithTimeout = async () => {
        const userResult = await withAuthTimeout(supabase.auth.getUser())
        if (!mounted) return

        if (userResult.timedOut) {
          setUser(null)
          return
        }

        const { data: { user }, error: userError } = userResult.value
        if (userError) {
          setUser(null)
        } else if (user) {
          await loadProfile(user.id, user.email ?? "")
        } else {
          setUser(null)
        }
      }

      // Check existing session on mount. Retry once on Supabase lock conflict (concurrent getSession calls).
      const LOCK_STEAL_MSG = "Lock broken by another request with the 'steal' option."
      const init = async () => {
        try {
          let sessionResult = await withAuthTimeout(supabase.auth.getSession())
          if (sessionResult.timedOut) {
            void loadUserWithTimeout()
            return
          }

          let result = sessionResult.value
          const errMsg = result.error?.message ?? null
          if (errMsg === LOCK_STEAL_MSG && mounted) {
            await new Promise((r) => setTimeout(r, 80))
            if (!mounted) return
            sessionResult = await withAuthTimeout(supabase.auth.getSession())
            if (sessionResult.timedOut) {
              void loadUserWithTimeout()
              return
            }
            result = sessionResult.value
          }

          if (result.error && isStaleRefreshTokenError(result.error)) {
            await clearLocalSession()
            return
          }

          const { data: { session }, error } = result
          if (mounted && session?.user) {
            await loadProfile(session.user.id, session.user.email ?? "")
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          if (msg === LOCK_STEAL_MSG && mounted) {
            await new Promise((r) => setTimeout(r, 80))
            if (!mounted) return
            try {
              const retryResult = await withAuthTimeout(supabase.auth.getSession())
              if (retryResult.timedOut) {
                void loadUserWithTimeout()
                return
              }

              const { data: { session }, error: retryErr } = retryResult.value
              if (retryErr && isStaleRefreshTokenError(retryErr)) {
                await clearLocalSession()
                return
              }
              if (!retryErr && mounted && session?.user) await loadProfile(session.user.id, session.user.email ?? "")
            } catch {
              if (mounted) setUser(null)
            }
          } else if (isStaleRefreshTokenError(error)) {
            await clearLocalSession()
          } else {
            console.error("Failed to initialize auth session", error)
            if (mounted) setUser(null)
          }
        } finally {
          if (mounted) setLoading(false)
        }
      }
      if (initialUserRef.current === null) {
        void init()
      } else {
        setLoading(false)
      }

      // Subscribe to auth state changes (login / logout / token refresh)
      const authState = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return
        if (authHandlerInFlightRef.current) return
        authHandlerInFlightRef.current = true
        try {
          if (session?.user) {
            await loadProfile(session.user.id, session.user.email ?? "")
          } else {
            setUser(null)
          }
        } catch (error) {
          console.error("Failed to update auth state", error)
          setUser(null)
        } finally {
          authHandlerInFlightRef.current = false
          if (mounted) setLoading(false)
        }
      })
      subscription = authState.data.subscription
    } catch (error) {
      console.error("Failed to set up auth", error)
      setUser(null)
      setLoading(false)
    }

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are stable (useCallback with [] deps); auth setup must run exactly once
  }, [])

  const loginWithPassword = async (email: string, password: string): Promise<boolean> => {
    const supabase = getSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) return false
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    return !error
  }

  const requestPasswordReset = async (email: string): Promise<{ ok: boolean; error?: string }> => {
    const supabase = getSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return { ok: false, error: "Email is required" }
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/set-new-password`,
    })
    return { ok: !error, error: error?.message }
  }

  const logout = async () => {
    setUser(null)
    setLoading(false)
    const supabase = getSupabase()
    // Best-effort server-side revocation should not block UI logout.
    fetch("/api/logout", { method: "POST" }).catch(() => {})
    supabase.auth.signOut({ scope: "local" }).catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPassword, requestPasswordReset, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
