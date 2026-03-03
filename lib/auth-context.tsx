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
  login: (name: string, password: string) => Promise<boolean>
  logout: () => void
}

// Internal email mapping — must match what you create in Supabase Auth dashboard.
// Create these users at: Supabase Dashboard → Authentication → Users → Add User
// Email: carmen@luxustravel.co.za  Password: <the user's PIN>
const NAME_TO_EMAIL: Record<string, string> = {
  Carmen: "carmen@luxustravel.co.za",
  Leonie: "leonie@luxustravel.co.za",
  Dirk: "dirk@luxustravel.co.za",
  Monade: "monade@luxustravel.co.za",
  Douwlien: "douwlien@luxustravel.co.za",
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const devAuthEnabled = process.env.NEXT_PUBLIC_DEV_AUTH === "true"

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

  useEffect(() => {
    let mounted = true
    const supabase = getSupabase()

    // Check existing session on mount
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted && session?.user) {
        await loadProfile(session.user.id, session.user.email ?? "")
      }
      if (mounted) setLoading(false)
    }
    init()

    // Subscribe to auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? "")
      } else {
        setUser(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const login = async (name: string, password: string): Promise<boolean> => {
    if (!devAuthEnabled) return false
    const supabase = getSupabase()
    const email = NAME_TO_EMAIL[name]
    if (!email) return false

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return !error
  }

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
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginWithMicrosoft, loginWithPassword, requestPasswordReset, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
