"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { getSupabase } from "@/lib/supabase/client"
import type { Role } from "./types"

export interface User {
  name: string
  email: string
  role: Role | null
  roleStatus: "resolved" | "pending" | "missing"
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  loginWithPassword: (email: string, password: string) => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AUTH_INIT_TIMEOUT_MS = 4000
const AUTH_INIT_TIMEOUT_MESSAGE = "Timed out initializing auth session"
const PENDING_ROLE_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000] as const
const STALE_REFRESH_TOKEN_MESSAGES = [
  "Invalid Refresh Token",
  "Refresh Token Not Found",
  "refresh_token_not_found",
]

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
  const userStateRef = useRef<User | null>(initialUserRef.current)

  useEffect(() => {
    userStateRef.current = user
  }, [user])

  const makeEmailDisplayName = useCallback((email: string) => {
    const emailName = email.split("@")[0]
    return emailName.charAt(0).toUpperCase() + emailName.slice(1)
  }, [])

  const markUserRolePending = useCallback((fallbackEmail?: string) => {
    console.warn("[auth] Role resolution pending - profile lookup failed transiently", { fallbackEmail })
    setUser((current) => {
      if (current) {
        return {
          ...current,
          roleStatus: current.roleStatus === "missing" ? "missing" : "pending",
        }
      }

      if (!fallbackEmail) {
        return null
      }

      return {
        name: makeEmailDisplayName(fallbackEmail),
        email: fallbackEmail,
        role: null,
        roleStatus: "pending",
      }
    })
  }, [makeEmailDisplayName])

  const loadProfile = useCallback(async (userId: string, fallbackEmail: string) => {
    const supabase = getSupabase()
    const tryFetchProfile = async () =>
      supabase
        .from("profiles")
        .select("name, surname, clearance_level, email")
        .eq("user_id", userId)
        .single()

    let result = await tryFetchProfile()

    // Retry once for transient profile read issues so we can recover admin/manager roles quickly.
    if (!result.data && result.error && result.error.code !== "PGRST116") {
      await new Promise((r) => setTimeout(r, 250))
      result = await tryFetchProfile()
    }

    const profile = result.data
    const profileError = result.error

    if (profile) {
      const displayName = [profile.name, profile.surname].filter(Boolean).join(" ").trim() || profile.name
      setUser({
        name: displayName,
        email: profile.email || fallbackEmail,
        role: profile.clearance_level as Role,
        roleStatus: "resolved",
      })
      return
    }

    if (!profileError || profileError.code === "PGRST116") {
      setUser({
        name: makeEmailDisplayName(fallbackEmail),
        email: fallbackEmail,
        role: "consultant",
        roleStatus: "missing",
      })
      return
    }

    markUserRolePending(fallbackEmail)
  }, [makeEmailDisplayName, markUserRolePending])

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
    if (!user || user.roleStatus !== "pending") return

    let cancelled = false

    const retryRoleResolution = async () => {
      const supabase = getSupabase()

      for (const delayMs of PENDING_ROLE_RETRY_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        if (cancelled) return

        try {
          const {
            data: { user: authUser },
            error: authUserError,
          } = await supabase.auth.getUser()

          if (cancelled) return
          if (authUserError || !authUser) return

          await loadProfile(authUser.id, authUser.email ?? "")
          if (cancelled) return

          if (userStateRef.current?.roleStatus !== "pending") {
            return
          }
        } catch (error) {
          console.warn("[auth] Pending role retry failed", { error })
        }
      }
    }

    void retryRoleResolution()

    return () => {
      cancelled = true
    }
  }, [user, loadProfile])

  useEffect(() => {
    let mounted = true
    let subscription: { unsubscribe: () => void } | undefined

    try {
      const supabase = getSupabase()
      const getSessionWithTimeout = async () => {
        let timeoutId: number | undefined
        try {
          return await Promise.race([
            supabase.auth.getSession(),
            new Promise<never>((_, reject) => {
              timeoutId = window.setTimeout(() => {
                reject(new Error(AUTH_INIT_TIMEOUT_MESSAGE))
              }, AUTH_INIT_TIMEOUT_MS)
            }),
          ])
        } finally {
          if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId)
          }
        }
      }

      // Check existing session on mount.
      const init = async () => {
        try {
          const result = await getSessionWithTimeout()

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
          if (msg === AUTH_INIT_TIMEOUT_MESSAGE && mounted) {
            try {
              const { data: { user }, error: userError } = await supabase.auth.getUser()
              if (userError) {
                markUserRolePending()
              } else if (user) {
                await loadProfile(user.id, user.email ?? "")
              } else {
                setUser(null)
              }
            } catch {
              markUserRolePending()
            }
          } else if (isStaleRefreshTokenError(error)) {
            await clearLocalSession()
          } else {
            console.error("Failed to initialize auth session", error)
            if (mounted) {
              markUserRolePending()
            }
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
          markUserRolePending(session?.user?.email ?? "")
        } finally {
          authHandlerInFlightRef.current = false
          if (mounted) setLoading(false)
        }
      })
      subscription = authState.data.subscription
    } catch (error) {
      console.error("Failed to set up auth", error)
      markUserRolePending()
      setLoading(false)
    }

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are stable (useCallback with [] deps); auth setup must run exactly once
  }, [clearLocalSession, isStaleRefreshTokenError, loadProfile, markUserRolePending])

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
