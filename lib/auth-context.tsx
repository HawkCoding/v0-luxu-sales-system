"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
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
  loginWithMicrosoft: () => Promise<boolean>
  loginWithPassword: (email: string, password: string) => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

const AUTH_INIT_TIMEOUT_MS = 4000
const AUTH_INIT_TIMEOUT_MESSAGE = "Timed out initializing auth session"
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
  const [user, setUser] = useState<User | null>(initialUser)
  const [loading, setLoading] = useState(initialUser === null)

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
      // Profile not found — derive name from email prefix, default to consultant
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

      // Check existing session on mount. Retry once on Supabase lock conflict (concurrent getSession calls).
      const LOCK_STEAL_MSG = "Lock broken by another request with the 'steal' option."
      const init = async () => {
        try {
          let result = await getSessionWithTimeout()
          const errMsg = result.error?.message ?? null
          if (errMsg === LOCK_STEAL_MSG && mounted) {
            await new Promise((r) => setTimeout(r, 80))
            if (!mounted) return
            result = await getSessionWithTimeout()
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
              const { data: { session }, error: retryErr } = await getSessionWithTimeout()
              if (retryErr && isStaleRefreshTokenError(retryErr)) {
                await clearLocalSession()
                return
              }
              if (!retryErr && mounted && session?.user) await loadProfile(session.user.id, session.user.email ?? "")
            } catch {
              if (mounted) setUser(null)
            }
          } else if (msg === AUTH_INIT_TIMEOUT_MESSAGE && mounted) {
            try {
              const { data: { user }, error: userError } = await supabase.auth.getUser()
              if (userError) {
                setUser(null)
              } else if (user) {
                await loadProfile(user.id, user.email ?? "")
              } else {
                setUser(null)
              }
            } catch {
              setUser(null)
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
      if (initialUser === null) {
        void init()
      } else {
        setLoading(false)
      }

      // Subscribe to auth state changes (login / logout / token refresh)
      const authState = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return
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
  }, [clearLocalSession, initialUser, isStaleRefreshTokenError, loadProfile])

  const loginWithMicrosoft = async (): Promise<boolean> => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return !error
  }

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
    const supabase = getSupabase()
    try {
      await fetch("/api/logout", { method: "POST" })
    } catch {
      // Ignore server logout errors and still clear the local client state below.
    }
    await supabase.auth.signOut({ scope: "local" }).catch(() => {})
    setUser(null)
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithMicrosoft, loginWithPassword, requestPasswordReset, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
